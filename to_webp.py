"""
Convertit les PNG du site en WebP pour reduire massivement la bande
passante (gain typique : x5 a x8 sur les photos).

Utilise cwebp (binaire Homebrew) qui produit des WebP nettement plus
petits que Pillow pour la meme qualite visuelle.

Strategie :
- Sprites (cap, perso) : qualite 92 + alpha preserve, max compression
- Photos lifestyle  : qualite 80 (visuellement indistinguable a l'oeil)
"""
import subprocess
from pathlib import Path

BASE = Path("/Users/th30/Documents/Projets/DEV/Bald.")

# (source.png, target.webp, qualite)
JOBS = [
    # Sprites avec alpha (haute qualite pour eviter les artefacts)
    ("cap.png",            "cap.webp",            92),
    ("guy.png",            "guy.webp",            92),
    ("guy-wink.png",       "guy-wink.webp",       92),
    ("guy-cap.png",        "guy-cap.webp",        92),
    ("guy-cap-wink.png",   "guy-cap-wink.webp",   92),
    # Photos lifestyle (qualite "photo web")
    ("lifestyle-escalade.png", "lifestyle-escalade.webp", 80),
    ("lifestyle-skate.png",    "lifestyle-skate.webp",    80),
    ("lifestyle-lecture.png",  "lifestyle-lecture.webp",  80),
    ("lifestyle-costar.png",   "lifestyle-costar.webp",   80),
]

total_before = total_after = 0
print(f"{'fichier':32}  {'avant':>8}  {'apres':>8}  {'gain'}")
print("-" * 70)

for src, dst, q in JOBS:
    src_path = BASE / src
    dst_path = BASE / dst
    if not src_path.exists():
        print(f"  ! source manquante : {src}")
        continue
    subprocess.run(
        ["cwebp", "-q", str(q), "-mt", "-quiet",
         str(src_path), "-o", str(dst_path)],
        check=True,
    )
    a = src_path.stat().st_size
    b = dst_path.stat().st_size
    total_before += a
    total_after += b
    ratio = (1 - b / a) * 100
    print(f"  {src:30}  {a // 1024:>6} K  {b // 1024:>6} K  -{ratio:4.1f}%")

print("-" * 70)
saved = total_before - total_after
print(
    f"  TOTAL  {total_before // 1024:>22} K  -> {total_after // 1024:>6} K   "
    f"  -{(1 - total_after/total_before)*100:.1f}%  (gain : {saved // 1024} K)"
)
