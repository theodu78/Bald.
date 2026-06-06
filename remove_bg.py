"""
Retire le fond blanc des PNG generes par IA.
Utilise un flood-fill scipy qui identifie les composants connectes
touchant les bords -> uniquement ceux-la deviennent transparents.
Preserve donc tous les details blancs internes du sprite (dents,
t-shirt, lettres BALD du logo, etc.).
"""
import numpy as np
from PIL import Image
from scipy import ndimage
from pathlib import Path

THRESHOLD = 240  # seuil "presque blanc" sur chaque canal

# (src, dst, kill_white_above_size)
#   - kill_above_size > 0 : passe 2 active, les ilots blancs internes
#     PLUS GROS que ce seuil deviennent transparents. Utilise pour la
#     laniere arriere de la casquette (26344 px) tout en preservant
#     les lettres du logo "Bald." (max 15108 px).
#   - kill_above_size = 0 : passe 2 desactivee, on garde tout.
JOBS = [
    ("Gemini_Generated_Image_fdqk9tfdqk9tfdqk.png", "cap.png",          20000),
    ("Gemini_Generated_Image_7n11xw7n11xw7n11.png", "guy.png",          0),
    ("Gemini_Generated_Image_m53sgbm53sgbm53s.png", "guy-wink.png",     0),
    ("Gemini_Generated_Image_ujb0mlujb0mlujb0.png", "guy-cap.png",      0),
    ("Gemini_Generated_Image_hakgh5hakgh5hakg.png", "guy-cap-wink.png", 0),
    # Photos produit : on n'applique PAS le remove_bg (les caps blanches
    # sont mangees par le flood-fill). A la place, on garde le fond blanc
    # des originales et on utilise mix-blend-mode:multiply en CSS pour
    # rendre le blanc transparent visuellement sur fond paper.
]

base = Path("/Users/th30/Documents/Projets/DEV/Bald.")

for src, dst, kill_above_size in JOBS:
    src_path = base / src
    dst_path = base / dst
    print(f"-> {src} -> {dst}")
    img = Image.open(src_path).convert("RGBA")
    arr = np.array(img)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    near_white = (r > THRESHOLD) & (g > THRESHOLD) & (b > THRESHOLD)
    labels, _ = ndimage.label(near_white)
    # Labels touchant les 4 bords = composants de fond
    border = set()
    border.update(labels[0, :].tolist())
    border.update(labels[-1, :].tolist())
    border.update(labels[:, 0].tolist())
    border.update(labels[:, -1].tolist())
    border.discard(0)
    bg_mask = np.isin(labels, list(border))
    arr[..., 3][bg_mask] = 0
    # Passe 2 (optionnelle, par job) : virer les ilots blancs internes plus
    # GROS que kill_above_size pixels (cas de la laniere arriere de la cap,
    # qui est plus grosse que les lettres du logo).
    if kill_above_size > 0:
        remaining_white = (
            (arr[..., 0] > THRESHOLD)
            & (arr[..., 1] > THRESHOLD)
            & (arr[..., 2] > THRESHOLD)
            & (arr[..., 3] > 0)
        )
        if remaining_white.any():
            rem_labels, n_rem = ndimage.label(remaining_white)
            sizes = ndimage.sum(
                remaining_white, rem_labels, range(1, n_rem + 1)
            )
            killed = 0
            for idx, size in enumerate(sizes, start=1):
                if size > kill_above_size:
                    arr[..., 3][rem_labels == idx] = 0
                    killed += 1
            print(f"   gros ilots blancs internes supprimes : {killed}")
    # Crop sur la bounding box des pixels non-transparents
    alpha = arr[..., 3]
    ys, xs = np.where(alpha > 0)
    if len(ys) > 0:
        y0, y1 = ys.min(), ys.max() + 1
        x0, x1 = xs.min(), xs.max() + 1
        arr = arr[y0:y1, x0:x1]
        print(f"   crop -> {x1-x0} x {y1-y0}")
    Image.fromarray(arr).save(dst_path, optimize=True)
    print(f"   ok ({dst_path.stat().st_size // 1024} KB)")

print("done.")
