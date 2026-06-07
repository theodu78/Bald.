/* ====================================================
   BALD. — Animation scroll-driven (version refactorée)
   Principe :
     - L'humain est positionné à GUY_TOP_FINAL_PCT (50%) du viewport.
     - La casquette atterrit avec son BAS pile sur le sommet du crâne.
       (Le SVG du perso est cadré : haut du SVG = sommet du crâne.)
     - On calcule la position d'atterrissage en pixels via offsetHeight
       pour avoir une précision indépendante de la résolution.
     - Animation pilotée par scroll, lissée via requestAnimationFrame.
   Phases :
     0.00 -> 0.55 : casquette en haut qui tourne, nuages remontent
     0.55 -> 0.70 : l'humain entre par le bas
     0.70 -> 0.90 : la casquette descend et se pose, rotation freine
                    monotone jusqu'à un multiple de 360° (pose droite)
     0.90 -> 0.95 : impact (flash + screen shake)
     0.95 -> 1.00 : punchline + CTA
   ==================================================== */

const cap        = document.getElementById('cap');
const baldGuy    = document.getElementById('baldGuy');
const cloudLayer = document.getElementById('cloudLayer');
const meterFill  = document.getElementById('meter');
const impact     = document.getElementById('impact');
const punchline  = document.getElementById('punchline');

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ===== Reperes de positions =====
const CAP_TOP_INIT_PCT  = 10;  // %  (la casquette est haute pendant la chute)
const GUY_TOP_INIT_PCT  = 96;  // %  (juste le sommet du crane visible en bas)

// Fraction du perso qui doit etre VISIBLE dans le viewport en etat final.
// On garde 5% du bas du t-shirt hors viewport pour cacher la ligne de coupe
// quelle que soit la taille d'ecran (PC ou mobile).
const GUY_VISIBLE_FRAC = 0.95;

/**
 * Position finale du perso (top%) calculee dynamiquement pour que ~5% du bas
 * du sprite deborde sous le viewport — indep. de la resolution.
 */
function getGuyTopFinalPct() {
  const guyH = baldGuy.offsetHeight;
  const vh   = window.innerHeight;
  const visiblePct = (GUY_VISIBLE_FRAC * guyH / vh) * 100;
  return Math.max(0, 100 - visiblePct);
}

// ===== Bornes de phases =====
const P_GUY_IN      = 0.55;
const P_GUY_DONE    = 0.70;
const P_LANDING_END = 0.90;
const P_IMPACT_END  = 0.95;

// ===== Rotation =====
const SPIN_FACTOR = 2.2; // ~2 tours sur tout le scroll

let impactTriggered    = false;
let punchlineTriggered = false;

// ===== Smooth scrub =====
// Le scroll natif peut sauter d'un coup (touche End, trackpad flick, etc.),
// ce qui faisait passer l'animation de 0 a 100% en 1 frame — le user ratait
// completement la chute de la casquette + l'ink-blast.
//
// On lerp entre `targetProgress` (scroll reel) et `displayedProgress` (ce
// qu'on rend a l'ecran), avec une velocite plafonnee. Resultat : meme un
// scroll instantane (End / Cmd+Down) joue l'animation en ~0.9s, l'utilisateur
// voit toujours la sequence.
//
// targetProgress + displayedProgress sont exprimes par rapport au scrollTrack
// COMPLET (0 = top, 1 = bas du scrollTrack), pour que l'ink-blast et le hero
// fade soient lisses en meme temps que l'animation principale.
let targetProgressFull    = 0;
let displayedProgressFull = 0;
const MAX_VELOCITY_PER_FRAME = 0.008; // ~2.1s pour parcourir 0 -> 1 a 60fps

/**
 * Position de la casquette quand elle est posée (en %).
 * Calculée pour que le BAS de la casquette pile sur le sommet du crâne.
 * Comme le SVG perso est cadré (haut du div = sommet du crâne),
 * il suffit de retirer la hauteur de la casquette à la position de l'humain.
 */
// Position du BAS DE CAP cible dans le sprite, en fraction de la hauteur.
// Mesure precise (luminance) : la cap dans guy-cap.png arrive a ~22% du
// sprite. On utilise la meme valeur pour que cap.png tombante atterrisse
// pile a la meme position que la cap dans le composite — pas de saut visible
// au moment de la bascule.
const SPRITE_BROW_RATIO = 0.22;

function getCapLandedPct() {
  const capH = cap.offsetHeight;
  const guyH = baldGuy.offsetHeight;
  const vh   = window.innerHeight;
  const capHeightPct = (capH / vh) * 100;
  const guyHeightPct = (guyH / vh) * 100;
  const browOffsetPct = SPRITE_BROW_RATIO * guyHeightPct;
  return getGuyTopFinalPct() + browOffsetPct - capHeightPct;
}

// Easing helpers
const easeInQuad   = t => t * t;
const easeOutQuad  = t => 1 - (1 - t) * (1 - t);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

// Refs pour gerer la transition vers le monde premium
const stageEl       = document.querySelector('.stage');
const hudEl         = document.querySelector('.hud');
const inkBlastEl    = document.getElementById('inkBlast');
const scrollTrackEl = document.querySelector('.scroll-track');

// Le scroll-track contient 7 sections :
//   - 5 sections (71.4%) : animation hero (chute, impact, punchline)
//   - 2 sections (28.6%) : buffer transition ink-blast
// L'animation se fige a 71.4%, puis l'ink-blast croit, puis tampon noir.
const ANIM_END_FRAC  = 5 / 7;     // 71.4% : fin animation hero
const INK_START_FRAC = 5.3 / 7;   // ~76% : l'ink demarre un peu apres la fin de l'anim
const INK_END_FRAC   = 6.7 / 7;   // ~96% : l'ink couvre tout l'ecran
// Au-dela d'INK_END_FRAC et jusqu'a la fin du scroll-track : ECRAN TOUT NOIR.
// On garde l'ink a opacity 1 + radius 150% pour ne PAS revoir la stage hero.
// L'ink ne fade que quand on entre dans le premium-world (sous le scroll-track).

function getHeroEndY() {
  return scrollTrackEl.offsetTop + scrollTrackEl.offsetHeight - window.innerHeight;
}

// Rayon (en vmax) qui couvre largement tout l'ecran depuis le centre 56%.
const INK_MAX_VMAX = 90;

function updateInkBlast(scrollTop, heroEnd) {
  inkBlastEl.style.setProperty('--ink-x', '50%');
  inkBlastEl.style.setProperty('--ink-y', '56%');

  const inkStart = heroEnd * INK_START_FRAC;
  const inkEnd   = heroEnd * INK_END_FRAC;

  if (scrollTop < inkStart || scrollTop >= heroEnd) {
    // HORS de la zone de transition : on cache completement l'inkblast.
    // display:none = pas de risque de rectangle noir parasite.
    inkBlastEl.style.display = 'none';
  } else if (scrollTop < inkEnd) {
    // L'ink grandit progressivement depuis le centre
    inkBlastEl.style.display = 'block';
    const t = (scrollTop - inkStart) / (inkEnd - inkStart);
    inkBlastEl.style.setProperty('--ink-pct', (t * INK_MAX_VMAX).toString());
  } else {
    // Zone tampon (inkEnd <= scroll < heroEnd) : ECRAN TOUT NOIR
    inkBlastEl.style.display = 'block';
    inkBlastEl.style.setProperty('--ink-pct', INK_MAX_VMAX.toString());
  }
}

function updateAnimation() {
  const heroEnd = getHeroEndY();
  // `virtualScrollTop` est le scroll lisse (pas le scrollY natif). Tant que le
  // smooth scrub n'a pas rattrape le scroll utilisateur, virtualScrollTop est
  // en retard — c'est exactement ce qu'on veut pour ne pas rater l'animation.
  const virtualScrollTop = displayedProgressFull * heroEnd;
  // Progress de l'animation hero limite a sa zone (5/7 du scrollTrack).
  // Au-dela, l'animation est figee a 100%.
  const animEnd  = heroEnd * ANIM_END_FRAC;
  const progress = clamp(virtualScrollTop / animEnd, 0, 1);

  // HUD + STAGE fade quand on entre dans la zone ink.
  // Indispensable : sans le fade de la stage, on la verrait reapparaitre
  // derriere l'ink-blast quand celui-ci s'efface pour reveler le premium.
  if (virtualScrollTop > heroEnd * INK_START_FRAC) {
    hudEl.classList.add('hero-fade');
    stageEl.classList.add('hero-fade');
  } else {
    hudEl.classList.remove('hero-fade');
    stageEl.classList.remove('hero-fade');
  }

  updateInkBlast(virtualScrollTop, heroEnd);

  // ============ JAUGE ============
  meterFill.style.width = (progress * 100) + '%';
  meterFill.style.backgroundColor =
    progress >= P_LANDING_END ? 'var(--gold)' :
    progress >= P_GUY_DONE    ? 'var(--accent)' :
                                'var(--paper)';

  // ============ NUAGES (remontent : on tombe) ============
  cloudLayer.style.transform = `translateY(${-progress * 320}%)`;

  // ============ ROTATION (monotone, finit sur un multiple de 360°) ============
  const rotAtGuyDone = P_GUY_DONE * 360 * SPIN_FACTOR;
  const rotEnd       = (Math.ceil(rotAtGuyDone / 360) + 1) * 360;

  let rotation;
  if (progress < P_GUY_DONE) {
    rotation = progress * 360 * SPIN_FACTOR;
  } else if (progress < P_LANDING_END) {
    const t = (progress - P_GUY_DONE) / (P_LANDING_END - P_GUY_DONE);
    const eased = easeOutQuad(t);
    rotation = rotAtGuyDone + (rotEnd - rotAtGuyDone) * eased;
  } else {
    rotation = rotEnd;
  }

  // ============ POSITIONS ============
  const capLandedPct = getCapLandedPct();

  const guyTopFinalPct = getGuyTopFinalPct();
  let capTopPct = CAP_TOP_INIT_PCT;
  let guyTopPct = GUY_TOP_INIT_PCT;

  // Phase 1 : casquette en haut, perso hors écran (juste sommet du crane visible)
  if (progress < P_GUY_IN) {
    capTopPct = CAP_TOP_INIT_PCT;
    guyTopPct = GUY_TOP_INIT_PCT;
  }
  // Phase 2 : l'humain monte
  else if (progress < P_GUY_DONE) {
    const t = (progress - P_GUY_IN) / (P_GUY_DONE - P_GUY_IN);
    const eased = easeOutCubic(t);
    guyTopPct = GUY_TOP_INIT_PCT + (guyTopFinalPct - GUY_TOP_INIT_PCT) * eased;
    capTopPct = CAP_TOP_INIT_PCT;
  }
  // Phase 3 : la casquette descend sur le crâne
  else if (progress < P_LANDING_END) {
    const t = (progress - P_GUY_DONE) / (P_LANDING_END - P_GUY_DONE);
    const eased = easeInQuad(t);
    capTopPct = CAP_TOP_INIT_PCT + (capLandedPct - CAP_TOP_INIT_PCT) * eased;
    guyTopPct = guyTopFinalPct;
  }
  // Phases 4 & 5 : tout fixe
  else {
    capTopPct = capLandedPct;
    guyTopPct = guyTopFinalPct;
  }

  // Anim 100% GPU : on n'utilise plus `top:%` (qui force un layout reflow a
  // chaque frame), uniquement transform avec translate3d (composite-only).
  // Conversion % viewport -> pixels.
  const vh = window.innerHeight;
  const capYpx = (capTopPct / 100) * vh;
  const guyYpx = (guyTopPct / 100) * vh;
  cap.style.transform     = `translate3d(-50%, ${capYpx}px, 0) rotate(${rotation}deg)`;
  baldGuy.style.transform = `translate3d(-44%, ${guyYpx}px, 0)`;

  // ============ IMPACT ============
  if (progress >= P_LANDING_END && progress < P_IMPACT_END) {
    if (!impactTriggered) {
      impact.classList.add('active');
      // Bascule sur le sprite composite (perso + cap posee).
      // En meme temps on cache la cap qui tombait : elle est maintenant integree
      // dans guy-cap.png.
      baldGuy.classList.add('has-cap');
      cap.classList.add('hidden');
      impactTriggered = true;
      // NB : pas de screen shake sur body.animate() — sur Firefox ca cree
      // un flash visuel parce que les position:fixed sont reparentes au body
      // transforme.
    }
  }

  // ============ PUNCHLINE ============
  // (Wink final desactive : la cap du sprite guy-cap-wink.png ne matche pas
  //  exactement celle de guy-cap.png — visible quand on alterne. On garde le
  //  sprite composite fixe.)
  if (progress >= P_IMPACT_END) {
    if (!punchlineTriggered) {
      punchline.classList.add('active');
      punchlineTriggered = true;
    }
  } else if (punchlineTriggered) {
    punchline.classList.remove('active');
    punchlineTriggered = false;
  }

  // Reset impact en scroll arriere
  if (progress < P_LANDING_END && impactTriggered) {
    impact.classList.remove('active');
    baldGuy.classList.remove('has-cap');
    cap.classList.remove('hidden');
    impactTriggered = false;
  }
}

// ===== Boucle rAF persistante avec smooth scrub =====
// Plutot que d'appeler updateAnimation a chaque event scroll, on tick en
// permanence. A chaque frame :
//   1) on recalcule targetProgressFull depuis scrollY reel
//   2) on rapproche displayedProgressFull de target avec velocite plafonnee
//   3) on rend l'animation avec displayedProgressFull
//
// Optim : on stoppe le tick quand on est endormi (hors zone hero ET diff
// negligeable) — on reveille via les events scroll/resize.
let rafId = null;
let lastHeroEnd = 0;

function recomputeTarget() {
  lastHeroEnd = getHeroEndY();
  targetProgressFull = lastHeroEnd > 0
    ? clamp(window.scrollY / lastHeroEnd, 0, 1)
    : 0;
}

function tickFrame() {
  rafId = null;
  recomputeTarget();

  const diff = targetProgressFull - displayedProgressFull;
  const absDiff = Math.abs(diff);
  if (absDiff > 0.0005) {
    const step = Math.sign(diff) * Math.min(absDiff, MAX_VELOCITY_PER_FRAME);
    displayedProgressFull = clamp(displayedProgressFull + step, 0, 1);
  } else {
    displayedProgressFull = targetProgressFull;
  }

  updateAnimation();

  // Continue de ticker tant qu'on n'a pas converge OU qu'on est dans la
  // zone hero (au cas ou le user scrolle a nouveau).
  const stillScrubbing = Math.abs(targetProgressFull - displayedProgressFull) > 0.0005;
  const inHeroZone     = window.scrollY < lastHeroEnd;
  if (stillScrubbing || inHeroZone) {
    rafId = requestAnimationFrame(tickFrame);
  }
}

function wakeTick() {
  if (rafId === null) rafId = requestAnimationFrame(tickFrame);
}

window.addEventListener('scroll', wakeTick, { passive: true });
window.addEventListener('resize', wakeTick);

// Init : on snap displayed sur target pour ne pas rejouer une anim de
// chargement bizarre quand on reload a mi-page.
recomputeTarget();
displayedProgressFull = targetProgressFull;
updateAnimation();
wakeTick();
