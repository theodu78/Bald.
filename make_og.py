"""
Genere l'image Open Graph (1200x630) servie quand quelqu'un partage le
lien du site sur Insta / X / Slack / WhatsApp / etc.

Layout editorial 50/50 :
- Gauche  : panel blanc avec la photo de la 5panel noire (product-5panel-noir.png)
- Droite  : panel ink avec le claim "LA CASQUETTE / DES VRAIS CHAUVES."
            + sous-titre "Streetwear." + mention "BALD.STORE" en pied
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

BASE  = Path("/Users/th30/Documents/Projets/DEV/Bald.")
W, H  = 1200, 630
INK   = (10, 10, 10)
PAPER = (246, 244, 238)
WHITE = (255, 255, 255)
ACCENT = (230, 57, 70)

LEFT_W  = 540               # largeur du panel photo (gauche)
RIGHT_W = W - LEFT_W        # largeur du panel texte (droite)

# Police lourde la plus dispo
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
]
font_path = next((p for p in FONT_CANDIDATES if Path(p).exists()), None)
if not font_path:
    raise SystemExit("Pas de police systeme trouvee")
print(f"Police : {font_path}")

# ============================================================
#  CANVAS — 2 zones de couleur
# ============================================================
img = Image.new("RGB", (W, H), INK)
left_panel = Image.new("RGB", (LEFT_W, H), WHITE)
img.paste(left_panel, (0, 0))

# ============================================================
#  PHOTO CASQUETTE (panel gauche)
# ============================================================
cap_src = BASE / "og-source-5panel.png"
cap = Image.open(cap_src).convert("RGBA")

# Crop les bords du screenshot source (point curseur + barre UI)
sw, sh = cap.size
crop_margin = int(min(sw, sh) * 0.12)
cap = cap.crop((crop_margin, crop_margin, sw - crop_margin, sh - crop_margin))

PAD = 30
target_w = LEFT_W - 2 * PAD
target_h = H - 2 * PAD
cap.thumbnail((target_w, target_h), Image.LANCZOS)
cw, ch = cap.size
cx = (LEFT_W - cw) // 2
cy = (H - ch) // 2
img.paste(cap, (cx, cy), cap)

# ============================================================
#  TEXTE (panel droit)
# ============================================================
draw = ImageDraw.Draw(img)

def measure(text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0], bb[3] - bb[1]

# Zone texte
TEXT_MARGIN_L = 56                              # depuis le bord du panel
TEXT_X        = LEFT_W + TEXT_MARGIN_L
TEXT_W        = RIGHT_W - TEXT_MARGIN_L - 40    # marge droite plus petite

# === TITRE 2 lignes avec autofit ===
line1     = "LA CASQUETTE"
line2_txt = "DES VRAIS CHAUVES"
line2_dot = "."
LEADING   = 6

TITLE_SIZE = 90
while True:
    f = ImageFont.truetype(font_path, TITLE_SIZE)
    w_full, _ = measure(line2_txt + line2_dot, f)
    w1_test, _ = measure(line1, f)
    if max(w_full, w1_test) <= TEXT_W or TITLE_SIZE <= 28:
        font_title = f
        break
    TITLE_SIZE -= 3

w1, h1   = measure(line1, font_title)
w2_txt, h2 = measure(line2_txt, font_title)
w2_dot, _  = measure(line2_dot, font_title)

# === SOUS-TITRE ===
SUB_GAP  = 38
font_sub = ImageFont.truetype(font_path, 26)
sub      = "Streetwear."
sw, sh   = measure(sub, font_sub)

# === BRAND PIED ===
font_brand = ImageFont.truetype(font_path, 18)
brand      = "BALD.STORE"

# === LAYOUT VERTICAL ===
# Bloc titre + gap + sous-titre, centre verticalement dans la zone
block_h = h1 + LEADING + h2 + SUB_GAP + sh
ty      = (H - block_h) // 2 - 12

# Ligne 1
draw.text((TEXT_X, ty), line1, font=font_title, fill=PAPER)

# Ligne 2 (texte + point rouge)
y2 = ty + h1 + LEADING
draw.text((TEXT_X, y2), line2_txt, font=font_title, fill=PAPER)
draw.text((TEXT_X + w2_txt, y2), line2_dot, font=font_title, fill=ACCENT)

# Sous-titre (couleur paper attenuee)
faded = tuple(int(c * 0.55 + INK[i] * 0.45) for i, c in enumerate(PAPER))
sy = y2 + h2 + SUB_GAP
draw.text((TEXT_X, sy), sub, font=font_sub, fill=faded)

# Brand en pied
draw.text((TEXT_X, H - 56), brand, font=font_brand, fill=faded)

# ============================================================
#  EXPORT
# ============================================================
img.save(BASE / "og-image.png", optimize=True)
img.save(BASE / "og-image.jpg", quality=90, optimize=True)
print(f"og-image.png  : {(BASE / 'og-image.png').stat().st_size // 1024} K")
print(f"og-image.jpg  : {(BASE / 'og-image.jpg').stat().st_size // 1024} K")
