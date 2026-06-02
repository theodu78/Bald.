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
const cta        = document.getElementById('cta');

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ===== Reperes de positions =====
const CAP_TOP_INIT_PCT  = 10;  // %  (la casquette est haute pendant la chute)
const GUY_TOP_FINAL_PCT = 62;  // %  (perso ancre vers le bas, son t-shirt deborde)
const GUY_TOP_INIT_PCT  = 96;  // %  (juste le sommet du crane visible en bas)

// ===== Bornes de phases =====
const P_GUY_IN      = 0.55;
const P_GUY_DONE    = 0.70;
const P_LANDING_END = 0.90;
const P_IMPACT_END  = 0.95;

// ===== Rotation =====
const SPIN_FACTOR = 2.2; // ~2 tours sur tout le scroll

let impactTriggered    = false;
let punchlineTriggered = false;
let ticking            = false;

/**
 * Position de la casquette quand elle est posée (en %).
 * Calculée pour que le BAS de la casquette pile sur le sommet du crâne.
 * Comme le SVG perso est cadré (haut du div = sommet du crâne),
 * il suffit de retirer la hauteur de la casquette à la position de l'humain.
 */
// Position du sourcil dans le sprite PNG du perso, en fraction de la hauteur.
// Augmenter cette valeur = la cap descend plus bas sur la tete.
const SPRITE_BROW_RATIO = 0.32;

function getCapLandedPct() {
  const capH = cap.offsetHeight;
  const guyH = baldGuy.offsetHeight;
  const vh   = window.innerHeight;
  const capHeightPct = (capH / vh) * 100;
  const guyHeightPct = (guyH / vh) * 100;
  const browOffsetPct = SPRITE_BROW_RATIO * guyHeightPct;
  return GUY_TOP_FINAL_PCT + browOffsetPct - capHeightPct;
}

// Easing helpers
const easeInQuad   = t => t * t;
const easeOutQuad  = t => 1 - (1 - t) * (1 - t);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

function updateAnimation() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress  = clamp(scrollTop / docHeight, 0, 1);

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

  let capTopPct = CAP_TOP_INIT_PCT;
  let guyTopPct = GUY_TOP_INIT_PCT;

  // Phase 1 : casquette en haut, perso hors écran
  if (progress < P_GUY_IN) {
    capTopPct = CAP_TOP_INIT_PCT;
    guyTopPct = GUY_TOP_INIT_PCT;
  }
  // Phase 2 : l'humain monte
  else if (progress < P_GUY_DONE) {
    const t = (progress - P_GUY_IN) / (P_GUY_DONE - P_GUY_IN);
    const eased = easeOutCubic(t);
    guyTopPct = GUY_TOP_INIT_PCT + (GUY_TOP_FINAL_PCT - GUY_TOP_INIT_PCT) * eased;
    capTopPct = CAP_TOP_INIT_PCT;
  }
  // Phase 3 : la casquette descend sur le crâne
  else if (progress < P_LANDING_END) {
    const t = (progress - P_GUY_DONE) / (P_LANDING_END - P_GUY_DONE);
    const eased = easeInQuad(t);
    capTopPct = CAP_TOP_INIT_PCT + (capLandedPct - CAP_TOP_INIT_PCT) * eased;
    guyTopPct = GUY_TOP_FINAL_PCT;
  }
  // Phases 4 & 5 : tout fixe
  else {
    capTopPct = capLandedPct;
    guyTopPct = GUY_TOP_FINAL_PCT;
  }

  cap.style.top       = capTopPct + '%';
  cap.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
  baldGuy.style.top   = guyTopPct + '%';

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

// rAF pour lisser les events de scroll
function onScroll() {
  if (!ticking) {
    requestAnimationFrame(() => {
      updateAnimation();
      ticking = false;
    });
    ticking = true;
  }
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', updateAnimation);

cta.addEventListener('click', () => {
  alert('▶ Connexion Shopify Storefront API à brancher ici.\n\nProchaine étape : Buy Button ou checkout headless.');
});

// Premier render
updateAnimation();
