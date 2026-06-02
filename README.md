# BALD.

Landing page prototype scroll-driven pour la marque streetwear **BALD.** — casquettes pour chauves assumés.

Le concept : tu scrolles, une casquette tombe en chute libre dans le ciel pixel art, un chauve apparaît par le bas de l'écran, et la cap atterrit pile sur sa tête → punchline `BALD. ACQUIRED`.

## Stack

- HTML / CSS / JS vanilla (zéro build, zéro dépendance)
- Sprites en PNG générés via Gemini, fond retiré automatiquement
- Animation pilotée par le scroll (lissée via `requestAnimationFrame`)
- Esthétique Nintendo / 16-bit (HUD, jauge, cœurs pixel art, police Press Start 2P)

## Lancer en local

```bash
python3 -m http.server 4242
# puis ouvrir http://localhost:4242
```

## Régénérer les sprites depuis les PNG bruts

Si tu remplaces une image source `Gemini_Generated_Image_*.png`, relance :

```bash
python3 remove_bg.py
```

Le script utilise `scipy.ndimage` pour faire un flood-fill depuis les bords (préserve les blancs internes du sprite) + une 2ème passe optionnelle pour virer les artefacts blancs internes (la lanière arrière de la cap par exemple).

## Architecture

```
index.html       structure + sprites + HUD
style.css        palette NES, animations, responsive
script.js        sequence scroll : chute → entree humain → atterrissage → impact → punchline
remove_bg.py     pipeline de traitement des PNG bruts
*.png            sprites finaux utilises par le site
Gemini_*.png     sources originales (regenerer si besoin)
```

## Séquence du scroll

| Progression | Phase |
|-------------|-------|
| 0 — 55 % | Casquette qui tourne dans le ciel, nuages qui montent (chute libre) |
| 55 — 70 % | L'humain monte par le bas du viewport |
| 70 — 90 % | La cap descend, rotation freine, atterrissage |
| 90 — 95 % | Impact : flash étoile + crossfade vers le sprite composite |
| 95 — 100 % | Punchline `BALD. ACQUIRED` + CTA |
