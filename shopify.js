/* ====================================================================
   BALD. — Module Shopify Storefront API
   ====================================================================
   - Fetch le produit + variants via GraphQL Storefront
   - Gere un cart (creation, add line, update qty, remove)
   - Persiste l'id du cart dans localStorage (pour ne pas perdre le panier
     entre rechargements)
   - Bind l'UI shop (swatches, bouton acheter) et l'UI cart (slide-out)
   - Le checkout final = redirection vers le checkout natif Shopify
     (securite PCI, Apple Pay, Stripe, etc. — on touche pas)
   ==================================================================== */

const SHOPIFY = {
  domain:  'qwq2i9-sn.myshopify.com',
  token:   'c5d78f20e6c190125cc80de071aec32f',
  version: '2024-10',
  handle:  'casquette-5-panneaux-1',
};

const STORAGE_CART_ID = 'bald_cart_id_v1';

// Handles a EXCLURE de la grille produits (affiches ailleurs ou pas voulus)
const EXCLUDED_HANDLES = new Set([
  'casquette-5-panneaux',
  't-shirt-teinte-lourd-unisexe',
]);
// Mapping couleur -> classe CSS pour les pastilles
const SWATCH_CLASS = {
  'Noir':         'swatch--noir',
  'Bleu Marine':  'swatch--bleu-marine',
  'Rouge':        'swatch--rouge',
  'Olive':        'swatch--olive',
  'Gris':         'swatch--gris',
  'Kaki':         'swatch--kaki',
};

const state = {
  product: null,
  selectedVariant: null,
  cart: null, // { id, checkoutUrl, lines: [...], totalAmount, currencyCode }
};

// ============================================================
//                       GRAPHQL HELPER
// ============================================================

async function gql(query, variables = {}) {
  const url = `https://${SHOPIFY.domain}/api/${SHOPIFY.version}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': SHOPIFY.token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error('[Shopify] GraphQL errors:', json.errors);
    throw new Error(json.errors[0]?.message || 'Storefront API error');
  }
  return json.data;
}

// ============================================================
//                          PRODUCT
// ============================================================

const PRODUCT_QUERY = `
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      id
      title
      handle
      description
      featuredImage { url altText }
      priceRange { minVariantPrice { amount currencyCode } }
      variants(first: 20) {
        edges {
          node {
            id
            title
            availableForSale
            price { amount currencyCode }
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

const ALL_PRODUCTS_QUERY = `
  query AllProducts {
    products(first: 12) {
      edges {
        node {
          id
          title
          handle
          description
          descriptionHtml
          productType
          tags
          featuredImage { url altText }
          priceRange { minVariantPrice { amount currencyCode } }
          variants(first: 20) {
            edges {
              node {
                id
                title
                availableForSale
                image { url altText }
                selectedOptions { name value }
              }
            }
          }
        }
      }
    }
  }
`;

async function fetchProduct() {
  const data = await gql(PRODUCT_QUERY, { handle: SHOPIFY.handle });
  if (!data.product) throw new Error(`Produit "${SHOPIFY.handle}" introuvable`);
  state.product = {
    ...data.product,
    variants: data.product.variants.edges.map(e => e.node),
  };
  state.selectedVariant = state.product.variants.find(v => v.availableForSale)
    || state.product.variants[0];
  return state.product;
}

async function fetchAllProducts() {
  const data = await gql(ALL_PRODUCTS_QUERY);
  return data.products.edges.map(e => {
    const variants = e.node.variants.edges.map(ed => ed.node);
    return {
      ...e.node,
      variants,
      defaultVariant: variants.find(v => v.availableForSale) || variants[0],
    };
  });
}

// Couleurs CSS pour les swatches — etendue avec mapping souple
function swatchClassFromLabel(label) {
  if (!label) return '';
  const norm = label.toLowerCase().trim();
  const map = {
    'noir': 'swatch--noir',
    'black': 'swatch--noir',
    'bleu marine': 'swatch--bleu-marine',
    'navy': 'swatch--bleu-marine',
    'dark navy': 'swatch--bleu-marine',
    'rouge': 'swatch--rouge',
    'red': 'swatch--rouge',
    'olive': 'swatch--olive',
    'gris': 'swatch--gris',
    'grey': 'swatch--gris',
    'gray': 'swatch--gris',
    'dark grey': 'swatch--gris',
    'charcoal': 'swatch--gris',
    'kaki': 'swatch--kaki',
    'khaki': 'swatch--kaki',
    'butter': 'swatch--butter',
    'beige': 'swatch--butter',
    'cream': 'swatch--butter',
    'white': 'swatch--white',
    'blanc': 'swatch--white',
  };
  return map[norm] || '';
}

// ============================================================
//                            CART
// ============================================================

const CART_QUERY_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost {
    totalAmount { amount currencyCode }
  }
  lines(first: 50) {
    edges {
      node {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
            title
            price { amount currencyCode }
            image { url altText }
            product { title featuredImage { url altText } }
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

const CART_CREATE = `
  mutation CartCreate { cartCreate { cart { ${CART_QUERY_FIELDS} } } }
`;
const CART_GET = `
  query CartGet($id: ID!) { cart(id: $id) { ${CART_QUERY_FIELDS} } }
`;
const CART_LINES_ADD = `
  mutation CartLinesAdd($id: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $id, lines: $lines) {
      cart { ${CART_QUERY_FIELDS} }
      userErrors { field message }
    }
  }
`;
const CART_LINES_UPDATE = `
  mutation CartLinesUpdate($id: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $id, lines: $lines) {
      cart { ${CART_QUERY_FIELDS} }
      userErrors { field message }
    }
  }
`;
const CART_LINES_REMOVE = `
  mutation CartLinesRemove($id: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $id, lineIds: $lineIds) {
      cart { ${CART_QUERY_FIELDS} }
      userErrors { field message }
    }
  }
`;

function normalizeCart(cart) {
  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    totalQuantity: cart.totalQuantity,
    totalAmount: parseFloat(cart.cost.totalAmount.amount),
    currencyCode: cart.cost.totalAmount.currencyCode,
    lines: cart.lines.edges.map(e => e.node),
  };
}

async function ensureCart() {
  if (state.cart) return state.cart;
  const stored = localStorage.getItem(STORAGE_CART_ID);
  if (stored) {
    try {
      const data = await gql(CART_GET, { id: stored });
      if (data.cart) {
        state.cart = normalizeCart(data.cart);
        return state.cart;
      }
    } catch (e) {
      // cart expired ou invalide → on en cree un neuf
    }
  }
  const data = await gql(CART_CREATE);
  state.cart = normalizeCart(data.cartCreate.cart);
  localStorage.setItem(STORAGE_CART_ID, state.cart.id);
  return state.cart;
}

async function addToCart(variantId, quantity = 1) {
  const cart = await ensureCart();
  const data = await gql(CART_LINES_ADD, {
    id: cart.id,
    lines: [{ merchandiseId: variantId, quantity }],
  });
  if (data.cartLinesAdd.userErrors.length) {
    throw new Error(data.cartLinesAdd.userErrors[0].message);
  }
  state.cart = normalizeCart(data.cartLinesAdd.cart);
  return state.cart;
}

async function updateLineQuantity(lineId, quantity) {
  const cart = state.cart;
  if (!cart) return;
  if (quantity <= 0) return removeLine(lineId);
  const data = await gql(CART_LINES_UPDATE, {
    id: cart.id,
    lines: [{ id: lineId, quantity }],
  });
  state.cart = normalizeCart(data.cartLinesUpdate.cart);
  return state.cart;
}

async function removeLine(lineId) {
  const cart = state.cart;
  if (!cart) return;
  const data = await gql(CART_LINES_REMOVE, {
    id: cart.id,
    lineIds: [lineId],
  });
  state.cart = normalizeCart(data.cartLinesRemove.cart);
  return state.cart;
}

function goToCheckout() {
  if (!state.cart?.checkoutUrl) return;
  window.location.href = state.cart.checkoutUrl;
}

// ============================================================
//                         UI BINDINGS
// ============================================================

function fmtPrice(amount, currency = 'EUR') {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

// Peuple la grille .products avec les vraies cartes Shopify
// (image + nom + prix + selecteur couleur + bouton Ajouter au panier).
function renderProductsGrid(products) {
  const grid = document.querySelector('.products');
  if (!grid) return;
  const visible = products.filter(p => !EXCLUDED_HANDLES.has(p.handle));
  grid.innerHTML = '';
  if (visible.length === 0) {
    grid.innerHTML = '<p class="products-loading">Aucun produit disponible.</p>';
    return;
  }
  visible.forEach(p => {
    // Etat de selection par carte
    let selected = p.defaultVariant;

    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.handle = p.handle;
    const imgUrl = p.featuredImage?.url || '';
    const imgAlt = p.featuredImage?.altText || p.title;
    const price = fmtPrice(
      p.priceRange.minVariantPrice.amount,
      p.priceRange.minVariantPrice.currencyCode
    );

    card.innerHTML = `
      <div class="product-img-wrap">
        <img src="${imgUrl}" alt="${imgAlt}" class="product-img" loading="lazy"/>
      </div>
      <div class="product-meta">
        <p class="product-name">${p.title}</p>
        <p class="product-price">${price}</p>
      </div>
      <div class="product-swatches" role="radiogroup" aria-label="Couleur"></div>
      <button class="product-buy" type="button">Ajouter au panier</button>
    `;

    const mainImgEl = card.querySelector('.product-img');
    const swatchesEl = card.querySelector('.product-swatches');

    // Click sur l'image -> ouvre la zone "details produit" en dessous
    mainImgEl.style.cursor = 'pointer';
    mainImgEl.addEventListener('click', (e) => {
      e.stopPropagation();
      renderProductDetail(p, selected);
    });
    card.querySelector('.product-img-wrap').addEventListener('click', (e) => {
      // delegue au click image
      if (e.target === e.currentTarget) {
        renderProductDetail(p, selected);
      }
    });

    // Render des swatches (une mini-vignette par variante = vraie photo de la
    // cap dans cette couleur, plus fiable que des mappings RGB approximatifs)
    p.variants.forEach(variant => {
      const colorOpt = variant.selectedOptions.find(o => o.name === 'Couleur')
                    || variant.selectedOptions.find(o => o.name === 'Color')
                    || variant.selectedOptions[0];
      const label = colorOpt?.value || variant.title;
      const variantImg = variant.image?.url || p.featuredImage?.url || '';
      const btn = document.createElement('button');
      btn.className = 'swatch swatch--variant';
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-label', label);
      btn.title = label;
      btn.setAttribute('aria-checked', variant.id === selected.id ? 'true' : 'false');
      if (variantImg) {
        btn.style.backgroundImage = `url(${variantImg})`;
        btn.style.backgroundSize = 'cover';
        btn.style.backgroundPosition = 'center';
      }
      if (!variant.availableForSale) {
        btn.setAttribute('aria-disabled', 'true');
        btn.setAttribute('title', label + ' — rupture');
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!variant.availableForSale) return;
        selected = variant;
        // Met a jour l'image principale de la carte avec la photo de la variante
        if (variantImg) mainImgEl.src = variantImg;
        // Met a jour le label visible
        [...swatchesEl.children].forEach(c =>
          c.setAttribute('aria-checked', c === btn ? 'true' : 'false'));
      });
      swatchesEl.appendChild(btn);
    });

    // Bouton "Ajouter au panier" pour cette carte
    const buyBtn = card.querySelector('.product-buy');
    buyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!selected) return;
      buyBtn.disabled = true;
      const orig = buyBtn.textContent;
      buyBtn.textContent = 'Ajout en cours…';
      try {
        await addToCart(selected.id, 1);
        renderCart();
        openCart();
        buyBtn.textContent = 'Ajouté ✓';
        setTimeout(() => { buyBtn.textContent = orig; buyBtn.disabled = false; }, 1200);
      } catch (err) {
        console.error(err);
        buyBtn.textContent = 'Erreur — réessayer';
        buyBtn.disabled = false;
      }
    });

    grid.appendChild(card);
  });
}

// Rend la zone "details produit" sous la grille, avec description Shopify
// + 4 points de reassurance (matière / impression / livraison / retours)
function renderProductDetail(product, selectedVariant) {
  const detail = document.getElementById('productDetail');
  const content = detail?.querySelector('.product-detail-content');
  if (!detail || !content) return;

  const colorOpt = selectedVariant?.selectedOptions.find(o => o.name === 'Couleur')
                || selectedVariant?.selectedOptions.find(o => o.name === 'Color')
                || selectedVariant?.selectedOptions[0];
  const colorLabel = colorOpt?.value || '';
  const desc = (product.descriptionHtml && product.descriptionHtml.trim())
    || (product.description && product.description.trim())
    || 'Un classique BALD. Imprimé à la demande, broderie premium, taille unique ajustable.';
  const tagsLine = (product.tags || []).slice(0, 4).join(' · ');
  const imgUrl = selectedVariant?.image?.url || product.featuredImage?.url || '';

  content.innerHTML = `
    <div class="pd-img"><img src="${imgUrl}" alt="${product.title}"/></div>
    <div class="pd-info">
      <p class="pd-eyebrow">${product.productType || 'BALD.'}${colorLabel ? ' · ' + colorLabel : ''}</p>
      <h2 class="pd-title">${product.title}</h2>
      <div class="pd-desc">${desc}</div>
      ${tagsLine ? `<p class="pd-tags">${tagsLine}</p>` : ''}
      <ul class="pd-points">
        <li><strong>Matière</strong> — 100% coton brodé, structure souple ajustable</li>
        <li><strong>Impression</strong> — à la demande chez Printful Europe, zéro stock</li>
        <li><strong>Livraison</strong> — 5-7 jours ouvrés, gratuite dès 50 €</li>
        <li><strong>Retours</strong> — sous 14 jours, sans question</li>
      </ul>
    </div>
  `;

  detail.hidden = false;
  // Scroll doux jusqu'a la zone detail
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderShop() {
  const product = state.product;
  if (!product) return;
  const titleEl = document.getElementById('shopProductTitle');
  const priceEl = document.getElementById('shopProductPrice');
  const swatchesEl = document.getElementById('shopSwatches');
  const buyBtn = document.getElementById('shopBuy');
  // La section .shop a ete retiree de l'HTML : on n'a plus rien a peupler.
  if (!titleEl || !swatchesEl || !buyBtn) return;
  titleEl.textContent = product.title;
  priceEl.textContent = fmtPrice(
    product.priceRange.minVariantPrice.amount,
    product.priceRange.minVariantPrice.currencyCode
  );

  // Pastilles couleur
  swatchesEl.innerHTML = '';
  product.variants.forEach(variant => {
    const colorOpt = variant.selectedOptions.find(o => o.name === 'Couleur')
                  || variant.selectedOptions[0];
    const label = colorOpt?.value || variant.title;
    const btn = document.createElement('button');
    btn.className = `swatch ${SWATCH_CLASS[label] || ''}`;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked',
      variant.id === state.selectedVariant.id ? 'true' : 'false');
    btn.setAttribute('data-label', label);
    btn.setAttribute('data-variant-id', variant.id);
    if (!variant.availableForSale) {
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('title', 'En rupture');
    }
    btn.addEventListener('click', () => {
      if (!variant.availableForSale) return;
      state.selectedVariant = variant;
      [...swatchesEl.children].forEach(c =>
        c.setAttribute('aria-checked', c === btn ? 'true' : 'false'));
    });
    swatchesEl.appendChild(btn);
  });

  buyBtn.disabled = false;
  buyBtn.textContent = 'Ajouter au panier';
}

function renderCart() {
  const cart = state.cart;
  const linesEl = document.getElementById('cartLines');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('cartCheckout');
  const fab = document.getElementById('cartFab');
  const fabCount = document.getElementById('cartFabCount');

  if (!cart || cart.lines.length === 0) {
    linesEl.innerHTML = '<li class="cart-empty">Votre panier est vide.</li>';
    totalEl.textContent = fmtPrice(0);
    checkoutBtn.disabled = true;
    fab.hidden = true;
    return;
  }

  linesEl.innerHTML = '';
  cart.lines.forEach(line => {
    const variant = line.merchandise;
    const colorOpt = variant.selectedOptions.find(o => o.name === 'Couleur')
                  || variant.selectedOptions.find(o => o.name === 'Color')
                  || variant.selectedOptions[0];
    const colorLabel = colorOpt?.value || variant.title;
    const lineTotal = parseFloat(variant.price.amount) * line.quantity;
    // Image variante > image produit par defaut
    const imgUrl = variant.image?.url
                || variant.product?.featuredImage?.url
                || '';

    const li = document.createElement('li');
    li.className = 'cart-line';
    li.innerHTML = `
      <div class="cart-line-img">${imgUrl ? `<img src="${imgUrl}" alt="${variant.product.title}"/>` : ''}</div>
      <div class="cart-line-info">
        <p class="cart-line-title">${variant.product.title}</p>
        <p class="cart-line-variant">${colorLabel}</p>
        <div class="cart-line-qty">
          <button data-action="dec" aria-label="Moins">−</button>
          <span>${line.quantity}</span>
          <button data-action="inc" aria-label="Plus">+</button>
        </div>
      </div>
      <span class="cart-line-price">${fmtPrice(lineTotal, variant.price.currencyCode)}</span>
    `;
    li.querySelector('[data-action="dec"]').addEventListener('click', async () => {
      await updateLineQuantity(line.id, line.quantity - 1);
      renderCart();
    });
    li.querySelector('[data-action="inc"]').addEventListener('click', async () => {
      await updateLineQuantity(line.id, line.quantity + 1);
      renderCart();
    });
    linesEl.appendChild(li);
  });

  // Don aux chauves-souris : +1€ visuel quand coche
  const donationEl = document.getElementById('cartDonation');
  const donationLineEl = document.getElementById('cartDonationLine');
  const isDonating = donationEl?.checked === true;
  const donationAmount = isDonating ? 1 : 0;
  if (donationLineEl) donationLineEl.hidden = !isDonating;

  totalEl.textContent = fmtPrice(cart.totalAmount + donationAmount, cart.currencyCode);
  checkoutBtn.disabled = false;
  fab.hidden = false;
  fabCount.textContent = cart.totalQuantity;
}

function openCart() {
  document.getElementById('cartPanel').classList.add('open');
  document.getElementById('cartPanel').setAttribute('aria-hidden', 'false');
  const backdrop = document.getElementById('cartBackdrop');
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('open'));
}
function closeCart() {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartPanel').setAttribute('aria-hidden', 'true');
  const backdrop = document.getElementById('cartBackdrop');
  backdrop.classList.remove('open');
  setTimeout(() => { backdrop.hidden = true; }, 200);
}

// ============================================================
//                          BOOT
// ============================================================

async function bootShopify() {
  try {
    // 1) Charge le produit principal (pour la fiche detaillee + animation hero)
    //    + tous les produits (pour la grille du haut), en parallele.
    const [, allProducts] = await Promise.all([
      fetchProduct(),
      fetchAllProducts(),
    ]);
    renderShop();
    renderProductsGrid(allProducts);

    // 2) Rehydrate le cart si on en a un en localStorage
    const stored = localStorage.getItem(STORAGE_CART_ID);
    if (stored) {
      try {
        const data = await gql(CART_GET, { id: stored });
        if (data.cart) {
          state.cart = normalizeCart(data.cart);
          renderCart();
        }
      } catch (_) { /* cart expire, on le creera au besoin */ }
    }

    // 3) Bind UI events (la section .shop a ete retiree, son bouton n'existe
     //    plus, on bind defensivement)
    const shopBuyBtn = document.getElementById('shopBuy');
    if (shopBuyBtn) {
      shopBuyBtn.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!state.selectedVariant) return;
        btn.disabled = true;
        btn.textContent = 'Ajout en cours…';
        try {
          await addToCart(state.selectedVariant.id, 1);
          renderCart();
          openCart();
          btn.textContent = 'Ajouter au panier';
        } catch (err) {
          console.error(err);
          btn.textContent = 'Erreur — réessayer';
        } finally {
          btn.disabled = false;
        }
      });
    }
    // Bouton fermer la zone detail
    const pdClose = document.getElementById('productDetailClose');
    if (pdClose) {
      pdClose.addEventListener('click', () => {
        document.getElementById('productDetail').hidden = true;
      });
    }
    document.getElementById('cartFab').addEventListener('click', openCart);
    document.getElementById('cartClose').addEventListener('click', closeCart);
    document.getElementById('cartBackdrop').addEventListener('click', closeCart);
    document.getElementById('cartCheckout').addEventListener('click', goToCheckout);

    // Toggle don aux chauves-souris : on rerender le cart pour mettre le total a jour
    const donationCheckbox = document.getElementById('cartDonation');
    if (donationCheckbox) {
      donationCheckbox.addEventListener('change', () => renderCart());
    }

    // Footer year
    document.getElementById('footerYear').textContent = new Date().getFullYear();

  } catch (err) {
    console.error('[BALD shop] boot failed:', err);
    document.getElementById('shopProductTitle').textContent = 'Boutique indisponible';
    document.getElementById('shopProductPrice').textContent = '—';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootShopify);
} else {
  bootShopify();
}
