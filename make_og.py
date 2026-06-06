"""
Genere l'image Open Graph (1200x630) servie quand quelqu'un partage le
lien du site sur Insta / X / Slack / WhatsApp / etc.

Design sobre coherent avec la DA :
- Fond noir (paper ink)
- Claim "LA CASQUETTE / DES VRAIS CHAUVES." sur 2 lignes (poster effect)
- Sous-titre "Streetwear."
- Point rouge final sur CHAUVES. (rappel marque)
- Mention "BALD.STORE" en pied
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

BASE = Path("/Users/th30/Documents/Projets/DEV/Bald.")
W, H = 1200, 630
INK = (10, 10, 10)
PAPER = (246, 244, 238)
ACCENT = (230, 57, 70)

# Cherche la police systeme la plus lourde (priorite Arial Black / Helvetica)
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/Library/Fonts/Arial Black.ttf",
]
font_path = next((p for p in FONT_CANDIDATES if Path(p).exists()), None)
if not font_path:
    raise SystemExit("Pas de police systeme trouvee")

print(f"Police utilisee : {font_path}")

img = Image.new("RGB", (W, H), INK)
draw = ImageDraw.Draw(img)

# Couleur "fadee" pour le sous-titre et la mention brand (paper + ink mix)
faded = tuple(int(c * 0.55 + INK[i] * 0.45) for i, c in enumerate(PAPER))

# ============================================================
#  TITRE — 2 lignes : "LA CASQUETTE" / "DES VRAIS CHAUVES."
# ============================================================
line1     = "LA CASQUETTE"
line2_txt = "DES VRAIS CHAUVES"
line2_dot = "."

# Mesures
def measure(text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0], bb[3] - bb[1]

# Autofit : on part de 130 et on reduit jusqu'a ce que la ligne la plus
# longue (ligne 2) tienne dans W - 2*MARGIN.
MARGIN_X    = 90
SAFE_W      = W - 2 * MARGIN_X
TITLE_SIZE  = 130
LEADING     = 8  # espace vertical entre les 2 lignes (proche, effet bloc)

font_title = ImageFont.truetype(font_path, TITLE_SIZE)
while True:
    w_full, _ = measure(line2_txt + line2_dot, font_title)
    if w_full <= SAFE_W or TITLE_SIZE <= 40:
        break
    TITLE_SIZE -= 4
    font_title = ImageFont.truetype(font_path, TITLE_SIZE)

w1, h1 = measure(line1, font_title)
w2_txt, h2 = measure(line2_txt, font_title)
w2_dot, _  = measure(line2_dot, font_title)
w2 = w2_txt + w2_dot

# Position verticale : centre le bloc titre + sous-titre legerement plus haut
SUB_GAP = 56
SUB_SIZE = 30
font_sub = ImageFont.truetype(font_path, SUB_SIZE)
sub = "Streetwear."
sw, sh = measure(sub, font_sub)

total_h = h1 + LEADING + h2 + SUB_GAP + sh
ty = (H - total_h) // 2 - 18

# Ligne 1 : "LA CASQUETTE" centree
x1 = (W - w1) // 2
draw.text((x1, ty), line1, font=font_title, fill=PAPER)

# Ligne 2 : "DES VRAIS CHAUVES" + "." rouge — centree comme un tout
x2 = (W - w2) // 2
y2 = ty + h1 + LEADING
draw.text((x2, y2), line2_txt, font=font_title, fill=PAPER)
draw.text((x2 + w2_txt, y2), line2_dot, font=font_title, fill=ACCENT)

# ============================================================
#  SOUS-TITRE — "Streetwear."
# ============================================================
sx = (W - sw) // 2
sy = ty + h1 + LEADING + h2 + SUB_GAP
draw.text((sx, sy), sub, font=font_sub, fill=faded)

# ============================================================
#  BRAND PIED — "BALD.STORE"
# ============================================================
brand = "BALD.STORE"
font_brand = ImageFont.truetype(font_path, 22)
draw.text((48, H - 56), brand, font=font_brand, fill=faded)

# ============================================================
#  EXPORT
# ============================================================
img.save(BASE / "og-image.png", optimize=True)
img.save(BASE / "og-image.jpg", quality=88, optimize=True)
print(f"og-image.png  : {(BASE / 'og-image.png').stat().st_size // 1024} K")
print(f"og-image.jpg  : {(BASE / 'og-image.jpg').stat().st_size // 1024} K")
