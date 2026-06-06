"""
Genere l'image Open Graph (1200x630) servie quand quelqu'un partage le
lien du site sur Insta / X / Slack / WhatsApp / etc.

Design sobre cohérent avec la DA :
- Fond noir (paper ink)
- "YES WE BALD." en gros (police systeme la plus lourde dispo)
- "Oui nous chauvons*" en sous-titre
- Point rouge sur le BALD (touche de la marque)
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

BASE = Path("/Users/th30/Documents/Projets/DEV/Bald.")
W, H = 1200, 630
INK = (10, 10, 10)
PAPER = (246, 244, 238)
ACCENT = (230, 57, 70)

# Cherche la police systeme la plus lourde (priorite Helvetica Bold / Arial)
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

# Titre principal
title = "YES WE BALD."
font_title = ImageFont.truetype(font_path, 160)
tb = draw.textbbox((0, 0), title, font=font_title)
tw, th = tb[2] - tb[0], tb[3] - tb[1]
tx = (W - tw) // 2
ty = (H - th) // 2 - 50
# Le titre en blanc
draw.text((tx, ty), title, font=font_title, fill=PAPER)
# Override du point final en rouge : on redessine juste le "."
draw.text((tx + tw - 38, ty), ".", font=font_title, fill=ACCENT)

# Sous-titre
sub = "Oui nous chauvons*"
font_sub = ImageFont.truetype(font_path, 28)
sb = draw.textbbox((0, 0), sub, font=font_sub)
sw = sb[2] - sb[0]
sx = (W - sw) // 2
sy = ty + th + 40
# Couleur paper avec faible opacite : on simule avec un melange
faded = tuple(int(c * 0.55 + INK[i] * 0.45) for i, c in enumerate(PAPER))
draw.text((sx, sy), sub, font=font_sub, fill=faded)

# Petite mention de marque en bas a gauche
brand = "BALD.SHOP"
font_brand = ImageFont.truetype(font_path, 22)
draw.text((48, H - 56), brand, font=font_brand, fill=faded)

img.save(BASE / "og-image.png", optimize=True)
# Compress en JPEG aussi (meilleure compatibilite reseaux sociaux)
img.save(BASE / "og-image.jpg", quality=88, optimize=True)
print(f"og-image.png  : {(BASE / 'og-image.png').stat().st_size // 1024} K")
print(f"og-image.jpg  : {(BASE / 'og-image.jpg').stat().st_size // 1024} K")
