const API_ORIGIN = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:4000'
  : 'https://api.cambinoscollections.com';
const APP_ORIGIN = 'https://app.cambinoscollections.com';
const STORE_PAUSED = document.body.dataset.storePaused === 'true';

const grid = document.getElementById('storeGrid');
const empty = document.getElementById('storeEmpty');
const errorPanel = document.getElementById('storeError');
const filters = document.getElementById('storeFilters');
const status = document.getElementById('storeStatus');
const search = document.getElementById('storeSearch');
const catalogSummary = document.getElementById('storeCatalogSummary');
const setFilter = document.getElementById('storeSetFilter');
const typeFilter = document.getElementById('storeTypeFilter');
const sortSelect = document.getElementById('storeSort');
const clearFilters = document.getElementById('storeClearFilters');
const resultsSummary = document.getElementById('storeResultsSummary');
const retry = document.getElementById('storeRetry');
const cartDialog = document.getElementById('storeCart');
const cartButton = document.getElementById('storeCartButton');
const cartClose = document.getElementById('storeCartClose');
const cartCount = document.getElementById('storeCartCount');
const cartItems = document.getElementById('storeCartItems');
const cartEmpty = document.getElementById('storeCartEmpty');
const cartSummary = document.getElementById('storeCartSummary');
const cartSubtotal = document.getElementById('storeCartSubtotal');
const minimumText = document.getElementById('storeMinimumText');
const minimumProgress = document.getElementById('storeMinimumProgress');
const cartMessage = document.getElementById('storeCartMessage');
const checkoutButton = document.getElementById('storeCheckoutButton');
const launchForm = document.getElementById('storeLaunchForm');
const launchSubmit = document.getElementById('storeLaunchSubmit');
const launchMessage = document.getElementById('storeLaunchMessage');
const launchSuccess = document.getElementById('storeLaunchSuccess');
const CART_KEY = 'cambinos-official-store-cart-v1';
const CHECKOUT_SNAPSHOT_KEY = 'cambinos-checkout-snapshot-v1';
const RECEIPT_SESSION_KEY = 'cambinos-checkout-return-v1';
const MINIMUM_CENTS = 1000;
const ADD_ON_CENTS = 300;
const SHARED_SET_KINDS = ['team_set', 'complete_set', 'master_set', 'card_collection'];
const CATALOGS = [
  { key: 'all', label: 'All inventory' },
  { key: 'pokemon', label: 'Pokémon', match: /pok[eé]mon|pokemon tcg/ },
  { key: 'magic', label: 'Magic', match: /magic:?(?: the)? gathering|\bmtg\b|scryfall/ },
  { key: 'yu_gi_oh', label: 'Yu-Gi-Oh!', match: /yu[- ]?gi[- ]?oh|yugioh/ },
  { key: 'lorcana', label: 'Lorcana', match: /lorcana/ },
  { key: 'one_piece', label: 'One Piece', match: /one piece|optcg/ },
  { key: 'sports', label: 'Sports', match: /sports? cards?|baseball|football|basketball|hockey|soccer|\bmlb\b|\bnfl\b|\bnba\b|\bnhl\b|topps|bowman|panini|donruss|upper deck/ },
  { key: 'digimon', label: 'Digimon', match: /digimon/ },
  { key: 'gundam', label: 'Gundam', match: /gundam/ },
  { key: 'riftbound', label: 'Riftbound', match: /riftbound/ },
  { key: 'dragon_ball', label: 'Dragon Ball FW', match: /dragon ball|fusion world/ },
  { key: 'invincible', label: 'Invincible', match: /invincible/ },
  { key: 'other', label: 'Other collectibles' },
];
const CATALOG_MATCH_ORDER = ['pokemon', 'magic', 'yu_gi_oh', 'lorcana', 'one_piece', 'digimon', 'gundam', 'riftbound', 'dragon_ball', 'invincible', 'sports'];
let inventory = [];
let activeCatalog = 'all';
let checkoutLive = false;
let cart = readCart();
const checkoutReturn = new URLSearchParams(location.search).get('checkout');
let receiptMessage = '';
// A return URL is not proof of payment. Preserve the cart until an order is
// confirmed by the server; Stripe webhooks remain the payment authority.

function readCart() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => typeof item?.listingId === 'string' && Number.isInteger(item?.quantity) && item.quantity > 0)
      .map((item) => ({ listingId: item.listingId, quantity: Math.min(99, item.quantity),
        ...(typeof item.quoteVersion === 'string' ? { quoteVersion: item.quoteVersion, cardIndex: item.cardIndex, display: item.display } : {}) }));
  } catch (_error) {
    return [];
  }
}

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_error) { /* Keep this session usable when storage is blocked. */ }
  renderCart();
}

function money(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function label(value) {
  return String(value || 'Collectible').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function priceCents(listing) {
  return Math.round((Number(listing?.price) || 0) * 100);
}

function listingSearchText(listing) {
  return [
    listing.title,
    listing.description,
    listing.bundleName,
    ...(listing.includedCards || []).map(card => [card.name, card.setName, card.itemNumber, card.edition].filter(Boolean).join(' ')),
    listing.product?.name,
    listing.product?.category,
    listing.product?.productType,
    listing.product?.manufacturer,
    listing.product?.series,
    listing.product?.setName,
    listing.product?.setCode,
    listing.product?.itemNumber,
    listing.product?.edition,
  ].filter(Boolean).join(' ').toLowerCase();
}

function listingCatalogKey(listing) {
  const text = listingSearchText(listing);
  // Match the manufacturer field, not a character name such as Leafeon.
  // An explicitly identified TCG still takes precedence over sports branding.
  const tcg = CATALOG_MATCH_ORDER.filter(key => key !== 'sports').map(key => CATALOGS.find(catalog => catalog.key === key)).find(catalog => catalog?.match?.test(text));
  if (tcg) return tcg.key;
  if (/^(?:leaf(?: trading cards)?|wild[\s-]*card(?: trading cards)?)$/i.test(String(listing.product?.manufacturer || '').trim())) return 'sports';
  return CATALOG_MATCH_ORDER.map((key) => CATALOGS.find((catalog) => catalog.key === key)).find((catalog) => catalog?.match?.test(text))?.key || 'other';
}

function catalogLabel(key) {
  return CATALOGS.find((catalog) => catalog.key === key)?.label || 'Other collectibles';
}

function listingProductType(listing) {
  if (listing.product?.isSealed) return 'sealed';
  if (['team_set', 'complete_set', 'master_set', 'card_collection', 'binder'].includes(listing.listingKind)) return 'collection';
  return 'single';
}

function cartEntry(listingId) {
  return cart.find((item) => item.listingId === listingId);
}

function setCartQuantity(listingId, quantity) {
  const listing = inventory.find((item) => item.id === listingId);
  const maximum = SHARED_SET_KINDS.includes(listing?.listingKind) ? 1 : Math.max(1, Number(listing?.quantity) || 1);
  const next = Math.max(0, Math.min(maximum, Math.floor(quantity)));
  cart = cart.filter((item) => item.listingId !== listingId);
  if (next > 0) cart.push({ listingId, quantity: next });
  saveCart();
}

function addToCart(listing) {
  const current = cartEntry(listing.id)?.quantity || 0;
  setCartQuantity(listing.id, current + 1);
  cartDialog.showModal();
}

function addSetSelection(listing, quote, cardIndex) {
  const single = cardIndex === undefined ? null : quote.lines[cardIndex];
  const amount = single ? single.unitPriceCents : quote.pricing?.availablePriceCents;
  if (!Number.isSafeInteger(amount) || amount <= 0 || (single && single.availableQuantity < 1)) return;
  cart = cart.filter(item => item.listingId !== listing.id);
  cart.push({ listingId: listing.id, quantity: 1, quoteVersion: quote.quoteVersion,
    ...(cardIndex === undefined ? {} : { cardIndex }),
    display: { title: single ? single.name : listing.title + ' - remaining cards', price: amount / 100, currency: quote.currency },
  });
  saveCart();
  cartDialog.showModal();
}

function sharedSetAvailabilityPanel(listing, buy) {
  const panel = element('details', 'store-card-details');
  panel.append(element('summary', '', 'Check available cards and remaining-set price'));
  const content = element('div', 'store-set-availability');
  content.setAttribute('aria-live', 'polite');
  const refresh = element('button', 'store-details-link', 'Refresh availability');
  refresh.type = 'button';
  let loading = false;
  async function load() {
    if (loading || STORE_PAUSED) return;
    loading = true;
    refresh.disabled = true;
    buy.disabled = true;
    content.replaceChildren(element('p', '', 'Checking shared inventory...'));
    try {
      const response = await fetch(`${API_ORIGIN}/api/storefront/listings/${encodeURIComponent(listing.id)}/set-availability`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error('Availability unavailable');
      const quote = payload.data;
      const hasAvailableCards = quote.lines.some(line => line.availableQuantity > 0);
      content.replaceChildren(element('p', '', !hasAvailableCards
        ? 'No cards currently available. All cards in this set are sold or reserved.'
        : quote.complete
        ? 'All originally listed cards are available. This does not certify a complete catalog checklist.'
        : 'Some originally listed cards are sold or reserved. This is a partial set.'));
      quote.lines.forEach(line => {
        const singlePrice = line.unitPriceCents === null ? '' : ` - ${money(line.unitPriceCents / 100, quote.currency)} each`;
        content.append(element('p', '', `${line.name}: ${line.availableQuantity} of ${line.quantity} available${singlePrice}${line.unavailableQuantity ? ` - ${line.unavailableQuantity} unavailable` : ''}`));
      });
      quote.lines.forEach(line => {
        if (line.availableQuantity > 0 && line.unitPriceCents !== null) {
          const singleBuy = element('button', 'store-details-link', 'Add one ' + line.name);
          singleBuy.type = 'button';
          singleBuy.addEventListener('click', () => addSetSelection(listing, quote, line.cardIndex));
          content.append(singleBuy);
        }
      });
      if (!hasAvailableCards) {
        content.append(element('p', '', 'Refresh availability to check whether any reservations have been released.'));
      } else if (quote.pricing) {
        content.append(element('p', '', `${money(quote.pricing.availablePriceCents / 100, quote.currency)} for remaining cards - same ${Number(quote.pricing.discountPercent.toFixed(2))}% set discount`));
      } else {
        content.append(element('p', '', 'Individual card prices have not been configured. No remaining-set price is estimated.'));
      }
      content.append(element('p', '', 'Availability is not a reservation. Inventory is checked again at checkout.'));
      buy.disabled = !hasAvailableCards || !quote.pricing?.purchasable;
      buy.textContent = !hasAvailableCards ? 'Currently unavailable' : quote.pricing?.purchasable ? 'Add available set' : 'Set pricing unavailable';
      buy.onclick = buy.disabled ? null : () => addSetSelection(listing, quote);
      if (hasAvailableCards) content.append(element('p', '', 'Choose one single or the available set. A new choice replaces this set’s current cart selection.'));
    } catch {
      content.replaceChildren(element('p', '', 'Availability could not be verified. Refresh to try again.'));
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }
  refresh.addEventListener('click', load);
  panel.addEventListener('toggle', () => { if (panel.open) void load(); });
  panel.append(content, refresh);
  return panel;
}

function productCard(listing) {
  const card = element('article', 'store-card');
  const visual = element('div', 'store-card-visual');
  const imageUrl = listing.product?.thumbnailUrl || listing.product?.imageUrl;
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = listing.product?.name || listing.title;
    image.loading = 'lazy';
    visual.append(image);
  } else {
    visual.append(element('span', 'store-card-placeholder', '𝕮𝕮'));
  }
  const badge = element('span', 'store-card-badge', listing.product?.isSealed ? 'Sealed' : label(listing.listingKind));
  visual.append(badge);
  if (priceCents(listing) < ADD_ON_CENTS) visual.append(element('span', 'store-card-addon', 'Add-on card'));

  const body = element('div', 'store-card-body');
  body.append(element('p', 'store-card-category', `${catalogLabel(listingCatalogKey(listing))} · ${listing.product?.category || 'Collectible'}`));
  body.append(element('h3', '', listing.title));
  const details = [listing.product?.setName, listing.product?.itemNumber ? `#${listing.product.itemNumber}` : null, listing.product?.edition].filter(Boolean).join(' · ');
  if (details) body.append(element('p', 'store-card-details', details));
  if (listing.description) body.append(element('p', 'store-card-description', listing.description));
  if (listing.includedCards?.length) {
    const contents = element('details', 'store-card-details');
    contents.append(element('summary', '', `Included cards (${listing.includedCards.length}) · seller selected`));
    listing.includedCards.forEach(item => contents.append(element('p', '', `${item.quantity} × ${[item.name, item.setName, item.itemNumber ? `#${item.itemNumber}` : '', item.edition].filter(Boolean).join(' · ')}`)));
    body.append(contents);
  }

  const footer = element('div', 'store-card-footer');
  const price = element('div', 'store-card-price');
  price.append(element('strong', '', money(listing.price, listing.currency)));
  const included = listing.includedTotalItems;
  price.append(element('span', '', included ? `${included} items included · ${listing.quantity} in stock` : `${listing.quantity} in stock`));
  const actions = element('div', 'store-card-actions');
  const detailsLink = element('a', 'store-details-link', 'Details');
  detailsLink.href = `${APP_ORIGIN}/marketplace-dossier?listingId=${encodeURIComponent(listing.id)}`;
  detailsLink.setAttribute('aria-label', `View details for ${listing.title}`);
  const buy = element('button', 'button store-buy-button', cartEntry(listing.id) ? 'Add another' : 'Add to cart');
  buy.type = 'button';
  if (!SHARED_SET_KINDS.includes(listing.listingKind)) buy.addEventListener('click', () => addToCart(listing));
  if (SHARED_SET_KINDS.includes(listing.listingKind)) {
    price.lastElementChild.textContent = 'Original bundle price - check current availability';
    const originalContents = body.querySelector('details summary');
    if (originalContents) originalContents.textContent = 'Original set contents - availability may change';
    buy.disabled = true;
    buy.textContent = 'Check availability first';
    body.append(sharedSetAvailabilityPanel(listing, buy));
  }
  actions.append(detailsLink, buy);
  footer.append(price, actions);
  body.append(footer);
  card.append(visual, body);
  return card;
}

function cartLine(listing, quantity) {
  const row = element('article', 'store-cart-line');
  const imageWrap = element('div', 'store-cart-line-image');
  const imageUrl = listing.product?.thumbnailUrl || listing.product?.imageUrl;
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    imageWrap.append(image);
  } else {
    imageWrap.append(element('span', '', '𝕮𝕮'));
  }
  const info = element('div', 'store-cart-line-info');
  info.append(element('h3', '', listing.title));
  const meta = element('p', '', money(listing.price, listing.currency));
  if (priceCents(listing) < ADD_ON_CENTS) meta.append(' · Add-on card');
  info.append(meta);
  const controls = element('div', 'store-cart-quantity');
  const minus = element('button', '', '−');
  minus.type = 'button';
  minus.setAttribute('aria-label', `Remove one ${listing.title}`);
  minus.addEventListener('click', () => setCartQuantity(listing.id, quantity - 1));
  const value = element('span', '', String(quantity));
  value.setAttribute('aria-label', `${quantity} in cart`);
  const plus = element('button', '', '+');
  plus.type = 'button';
  plus.disabled = SHARED_SET_KINDS.includes(listing.listingKind) || quantity >= listing.quantity;
  plus.setAttribute('aria-label', `Add one ${listing.title}`);
  plus.addEventListener('click', () => setCartQuantity(listing.id, quantity + 1));
  controls.append(minus, value, plus);
  const lineTotal = element('strong', 'store-cart-line-total', money(Number(listing.price) * quantity, listing.currency));
  row.append(imageWrap, info, controls, lineTotal);
  return row;
}

async function verifyCart() {
  if (!cart.length) return;
  const checkedCart = JSON.stringify(cart);
  try {
    const response = await fetch(`${API_ORIGIN}/api/storefront/cart/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart }),
    });
    const payload = await response.json();
    if (checkedCart !== JSON.stringify(cart)) return;
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Cart could not be verified.');
    if (Array.isArray(payload.data?.items)) {
      const verifiedIds = new Set(payload.data.items.map((item) => item.listing.id));
      const nextCart = cart.filter((item) => verifiedIds.has(item.listingId));
      if (nextCart.length !== cart.length) {
        cart = nextCart;
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
        renderCart();
        return;
      }
    }
    cartMessage.textContent = payload.data?.checkoutEligible
      ? checkoutLive ? 'Inventory and pricing verified. Ready for secure checkout.' : 'Inventory and pricing verified. Secure payment connection is the remaining step.'
      : payload.data?.minimumMessage || 'Add more merchandise to reach the $10 minimum.';
  } catch (error) {
    if (checkedCart !== JSON.stringify(cart)) return;
    checkoutButton.disabled = true;
    cartMessage.textContent = (error instanceof Error ? error.message : 'Cart could not be verified.') + ' Refresh availability and select your cards again before checkout.';
  }
}

function renderCart() {
  const valid = cart.map((entry) => {
    const original = inventory.find(item => item.id === entry.listingId);
    return { entry, listing: original && entry.quoteVersion && entry.display
      ? { ...original, title: entry.display.title, price: entry.display.price, currency: entry.display.currency } : original };
  }).filter(item => item.listing);
  const totalItems = valid.reduce((sum, item) => sum + item.entry.quantity, 0);
  const subtotalCents = valid.reduce((sum, item) => sum + priceCents(item.listing) * item.entry.quantity, 0);
  cartCount.textContent = String(totalItems);
  cartCount.setAttribute('aria-label', `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`);
  cartItems.replaceChildren(...valid.map(({ entry, listing }) => cartLine(listing, entry.quantity)));
  cartEmpty.hidden = valid.length > 0;
  cartSummary.hidden = valid.length === 0;
  if (!valid.length) return;
  cartSubtotal.textContent = money(subtotalCents / 100);
  const remaining = Math.max(0, MINIMUM_CENTS - subtotalCents);
  minimumProgress.style.width = `${Math.min(100, (subtotalCents / MINIMUM_CENTS) * 100)}%`;
  minimumText.textContent = remaining > 0 ? `Add ${money(remaining / 100)} to reach checkout` : 'Order minimum reached';
  checkoutButton.disabled = subtotalCents < MINIMUM_CENTS || !checkoutLive;
  checkoutButton.textContent = subtotalCents < MINIMUM_CENTS ? `Add ${money(remaining / 100)} more` : checkoutLive ? 'Continue to secure checkout' : 'Checkout is being activated';
  cartMessage.textContent = subtotalCents < MINIMUM_CENTS ? 'Low-cost singles can be combined with any other store inventory.' : 'Checking current inventory and pricing…';
  void verifyCart();
}

async function startCheckout() {
  if (!cart.length || checkoutButton.disabled) return;
  checkoutButton.disabled = true;
  checkoutButton.textContent = 'Opening secure checkout…';
  cartMessage.textContent = 'Verifying inventory and creating your protected Stripe checkout…';
  try {
    const response = await fetch(`${API_ORIGIN}/api/storefront/cart/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success || !payload.data?.checkoutUrl) throw new Error(payload.error || 'Secure checkout could not be started.');
    const destination = new URL(payload.data.checkoutUrl);
    if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') throw new Error('Checkout returned an unexpected destination. Please contact support.');
    try { sessionStorage.setItem(CHECKOUT_SNAPSHOT_KEY, JSON.stringify({ orderId: payload.data.orderId, items: cart })); } catch { /* Payment verification still works without storage. */ }
    location.assign(destination.href);
  } catch (error) {
    renderCart();
    cartMessage.textContent = error instanceof Error ? error.message : 'Secure checkout could not be started.';
  }
}

async function verifyCheckoutReturn() {
  const params = new URLSearchParams(location.search);
  let sessionId = params.get('session_id');
  try {
    if (sessionId) sessionStorage.setItem(RECEIPT_SESSION_KEY, sessionId);
    else sessionId = sessionStorage.getItem(RECEIPT_SESSION_KEY);
  } catch { /* Private browsing can restrict session storage. */ }
  if (!sessionId || !/^cs_[a-zA-Z0-9_]{4,240}$/.test(sessionId)) return;
  // Remove the receipt capability from the address bar and copied links.
  params.delete('session_id');
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash);
  receiptMessage = 'Checking your payment securely. Please do not place this order again yet.';
  status.lastElementChild.textContent = receiptMessage;
  try {
    const response = await fetch(`${API_ORIGIN}/api/storefront/checkout/receipt`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      cache: 'no-store', signal: AbortSignal.timeout(15000), body: JSON.stringify({ sessionId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error('unverified');
    if (payload.data?.status === 'paid') {
      receiptMessage = 'Payment confirmed. Thank you! Cambinos has reserved your purchased cards for fulfillment.';
      try {
        const snapshot = JSON.parse(sessionStorage.getItem(CHECKOUT_SNAPSHOT_KEY) || 'null');
        if (snapshot?.orderId === payload.data.orderId && Array.isArray(snapshot.items)) {
          const selectionKey = item => JSON.stringify([item.listingId, item.quoteVersion || null, item.cardIndex ?? null]);
          const purchased = new Map(snapshot.items.map(item => [selectionKey(item), item.quantity]));
          cart = readCart().map(item => ({ ...item, quantity: Math.max(0, item.quantity - (purchased.get(selectionKey(item)) || 0)) })).filter(item => item.quantity > 0);
          localStorage.setItem(CART_KEY, JSON.stringify(cart));
          sessionStorage.removeItem(CHECKOUT_SNAPSHOT_KEY);
        }
        sessionStorage.removeItem(RECEIPT_SESSION_KEY);
      } catch { /* Never turn a confirmed payment into a failure because storage is unavailable. */ }
    } else if (payload.data?.status === 'expired') {
      receiptMessage = 'This checkout expired without payment. Your saved cart can be reviewed again.';
      try { sessionStorage.removeItem(RECEIPT_SESSION_KEY); } catch { /* Optional storage. */ }
    } else {
      receiptMessage = 'Payment is still pending. Refresh this page to check again; do not pay twice.';
    }
  } catch {
    receiptMessage = 'We could not verify payment yet. Check your Stripe confirmation or contact support before paying again.';
  }
  status.lastElementChild.textContent = receiptMessage;
}

function renderFilters() {
  filters.replaceChildren(...CATALOGS.map((catalog) => {
    const count = catalog.key === 'all' ? inventory.length : inventory.filter((listing) => listingCatalogKey(listing) === catalog.key).length;
    const button = element('button', `store-filter${catalog.key === activeCatalog ? ' is-active' : ''}`, `${catalog.label} ${count}`);
    button.type = 'button';
    button.role = 'tab';
    button.setAttribute('aria-selected', String(catalog.key === activeCatalog));
    button.addEventListener('click', () => {
      activeCatalog = catalog.key;
      setFilter.value = 'All';
      renderFilters();
      renderSetOptions();
      renderInventory();
    });
    return button;
  }));
}

function inventoryForActiveCatalog() {
  return activeCatalog === 'all' ? inventory : inventory.filter((listing) => listingCatalogKey(listing) === activeCatalog);
}

function renderSetOptions() {
  const current = setFilter.value;
  const sets = [...new Set(inventoryForActiveCatalog().map((listing) => listing.product?.setName).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  const options = [element('option', '', 'All sets'), ...sets.map((setName) => element('option', '', setName))];
  options[0].value = 'All';
  sets.forEach((setName, index) => { options[index + 1].value = setName; });
  setFilter.replaceChildren(...options);
  setFilter.value = sets.includes(current) ? current : 'All';
  const selectedCatalog = catalogLabel(activeCatalog);
  catalogSummary.textContent = activeCatalog === 'all' ? 'All available products' : `${selectedCatalog} inventory`;
}

function renderInventory() {
  const query = search.value.trim().toLowerCase();
  const selectedSet = setFilter.value;
  const selectedType = typeFilter.value;
  const visible = inventoryForActiveCatalog().filter((listing) => {
    if (selectedSet !== 'All' && listing.product?.setName !== selectedSet) return false;
    if (selectedType !== 'All' && listingProductType(listing) !== selectedType) return false;
    return !query || listingSearchText(listing).includes(query);
  }).sort((left, right) => {
    if (sortSelect.value === 'price-low') return Number(left.price) - Number(right.price);
    if (sortSelect.value === 'price-high') return Number(right.price) - Number(left.price);
    if (sortSelect.value === 'name') return left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' });
    return String(right.publishedAt || '').localeCompare(String(left.publishedAt || ''));
  });
  grid.replaceChildren(...visible.map(productCard));
  empty.hidden = inventory.length > 0;
  resultsSummary.textContent = `${visible.length} ${visible.length === 1 ? 'listing' : 'listings'} shown${activeCatalog === 'all' ? '' : ` in ${catalogLabel(activeCatalog)}`}`;
  if (!visible.length && inventory.length) {
    grid.append(element('p', 'store-no-results', `No ${activeCatalog === 'all' ? 'official inventory' : catalogLabel(activeCatalog) + ' inventory'} matches these filters yet. Try another catalog, set, or search.`));
  }
}

function resetStoreFilters() {
  activeCatalog = 'all';
  search.value = '';
  typeFilter.value = 'All';
  sortSelect.value = 'newest';
  renderFilters();
  renderSetOptions();
  setFilter.value = 'All';
  renderInventory();
}

async function joinAppLaunchList(event) {
  event.preventDefault();
  launchMessage.textContent = '';
  launchMessage.classList.remove('is-error');
  if (!launchForm.reportValidity()) return;
  const formData = new FormData(launchForm);
  launchSubmit.disabled = true;
  launchSubmit.textContent = 'Joining…';
  try {
    const response = await fetch(`${API_ORIGIN}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.get('email'),
        interest: '',
        company: formData.get('company'),
        consent: formData.get('consent') === 'on',
        source: 'official-store-app-launch',
        referralCode: new URLSearchParams(location.search).get('ref') || '',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || 'We could not add you right now. Please try again.');
    launchForm.hidden = true;
    launchSuccess.hidden = false;
    launchSuccess.focus({ preventScroll: true });
  } catch (error) {
    launchMessage.textContent = error instanceof Error ? error.message : 'We could not add you right now. Please try again.';
    launchMessage.classList.add('is-error');
  } finally {
    launchSubmit.disabled = false;
    launchSubmit.textContent = 'Notify me';
  }
}

async function loadStore() {
  grid.replaceChildren();
  empty.hidden = true;
  errorPanel.hidden = true;
  status.className = 'store-status';
  status.lastElementChild.textContent = 'Connecting to official Cambinos inventory…';
  try {
    const [listingResponse, statusResponse] = await Promise.all([
      fetch(`${API_ORIGIN}/api/storefront/listings?limit=500`),
      fetch(`${API_ORIGIN}/api/storefront/status`),
    ]);
    const listingPayload = await listingResponse.json();
    const statusPayload = await statusResponse.json();
    if (!listingResponse.ok || !listingPayload.success) throw new Error('Inventory unavailable');
    inventory = Array.isArray(listingPayload.data) ? listingPayload.data : [];
    const live = statusResponse.ok && statusPayload.data?.checkout === 'live';
    const fulfillmentLive = statusResponse.ok && statusPayload.data?.fulfillment === 'live';
    checkoutLive = live;
    status.className = `store-status ${live ? 'is-live' : 'is-preparing'}`;
    status.lastElementChild.textContent = receiptMessage || (live
      ? checkoutReturn === 'success' ? 'You’ve returned from checkout. Check your payment confirmation before ordering again. Contact support if you are unsure.' : checkoutReturn === 'cancelled' ? 'Checkout was cancelled. Your saved cart is still here.' : fulfillmentLive ? 'Protected checkout and fulfillment are live.' : 'Secure checkout is live. Shipping details are protected in Stripe.'
      : 'Official inventory is open for browsing. Protected checkout is being connected.');
    renderFilters();
    renderSetOptions();
    renderInventory();
    renderCart();
  } catch (_error) {
    status.lastElementChild.textContent = 'Official inventory connection needs attention.';
    errorPanel.hidden = false;
  }
}

launchForm.addEventListener('submit', joinAppLaunchList);
if (STORE_PAUSED) {
  checkoutLive = false;
  cart = [];
  cartButton.disabled = true;
  void verifyCheckoutReturn();
} else {
  search.addEventListener('input', renderInventory);
  setFilter.addEventListener('change', renderInventory);
  typeFilter.addEventListener('change', renderInventory);
  sortSelect.addEventListener('change', renderInventory);
  clearFilters.addEventListener('click', resetStoreFilters);
  retry.addEventListener('click', loadStore);
  cartButton.addEventListener('click', () => cartDialog.showModal());
  cartClose.addEventListener('click', () => cartDialog.close());
  checkoutButton.addEventListener('click', startCheckout);
  cartDialog.addEventListener('click', (event) => { if (event.target === cartDialog) cartDialog.close(); });
  void verifyCheckoutReturn().then(loadStore);
}
