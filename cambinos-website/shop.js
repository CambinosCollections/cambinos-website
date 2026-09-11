const API_ORIGIN = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:4000'
  : 'https://api.cambinoscollections.com';
const APP_ORIGIN = 'https://app.cambinoscollections.com';

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
const CART_KEY = 'cambinos-official-store-cart-v1';
const MINIMUM_CENTS = 1000;
const ADD_ON_CENTS = 300;
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

function readCart() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => typeof item?.listingId === 'string' && Number.isInteger(item?.quantity) && item.quantity > 0)
      .map((item) => ({ listingId: item.listingId, quantity: Math.min(99, item.quantity) }));
  } catch (_error) {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
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
  return CATALOG_MATCH_ORDER.map((key) => CATALOGS.find((catalog) => catalog.key === key)).find((catalog) => catalog?.match?.test(text))?.key || 'other';
}

function catalogLabel(key) {
  return CATALOGS.find((catalog) => catalog.key === key)?.label || 'Other collectibles';
}

function listingProductType(listing) {
  if (listing.product?.isSealed) return 'sealed';
  if (['team_set', 'complete_set', 'master_set', 'binder'].includes(listing.listingKind)) return 'collection';
  return 'single';
}

function cartEntry(listingId) {
  return cart.find((item) => item.listingId === listingId);
}

function setCartQuantity(listingId, quantity) {
  const listing = inventory.find((item) => item.id === listingId);
  const maximum = Math.max(1, Number(listing?.quantity) || 1);
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
  buy.addEventListener('click', () => addToCart(listing));
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
  plus.disabled = quantity >= listing.quantity;
  plus.setAttribute('aria-label', `Add one ${listing.title}`);
  plus.addEventListener('click', () => setCartQuantity(listing.id, quantity + 1));
  controls.append(minus, value, plus);
  const lineTotal = element('strong', 'store-cart-line-total', money(Number(listing.price) * quantity, listing.currency));
  row.append(imageWrap, info, controls, lineTotal);
  return row;
}

async function verifyCart() {
  if (!cart.length) return;
  try {
    const response = await fetch(`${API_ORIGIN}/api/storefront/cart/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart }),
    });
    const payload = await response.json();
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
  } catch (_error) {
    cartMessage.textContent = 'Showing your saved cart. Live inventory will be verified before payment.';
  }
}

function renderCart() {
  const valid = cart.map((entry) => ({ entry, listing: inventory.find((item) => item.id === entry.listingId) })).filter((item) => item.listing);
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
  checkoutButton.disabled = true;
  checkoutButton.textContent = subtotalCents < MINIMUM_CENTS ? `Add ${money(remaining / 100)} more` : checkoutLive ? 'Secure checkout is being activated' : 'Checkout connection coming next';
  cartMessage.textContent = subtotalCents < MINIMUM_CENTS ? 'Low-cost singles can be combined with any other store inventory.' : 'Checking current inventory and pricing…';
  void verifyCart();
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
    const live = statusResponse.ok && statusPayload.data?.checkout === 'live' && statusPayload.data?.fulfillment === 'live';
    checkoutLive = live;
    status.className = `store-status ${live ? 'is-live' : 'is-preparing'}`;
    status.lastElementChild.textContent = live
      ? 'Protected checkout and fulfillment are live.'
      : 'Official inventory is open for browsing. Protected checkout is being connected.';
    renderFilters();
    renderSetOptions();
    renderInventory();
    renderCart();
  } catch (_error) {
    status.lastElementChild.textContent = 'Official inventory connection needs attention.';
    errorPanel.hidden = false;
  }
}

search.addEventListener('input', renderInventory);
setFilter.addEventListener('change', renderInventory);
typeFilter.addEventListener('change', renderInventory);
sortSelect.addEventListener('change', renderInventory);
clearFilters.addEventListener('click', resetStoreFilters);
retry.addEventListener('click', loadStore);
cartButton.addEventListener('click', () => cartDialog.showModal());
cartClose.addEventListener('click', () => cartDialog.close());
cartDialog.addEventListener('click', (event) => { if (event.target === cartDialog) cartDialog.close(); });
loadStore();
