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
const pageMessage = document.getElementById('storePageMessage');
const loadMoreButton = document.getElementById('storeLoadMore');
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
const minimumPanel = document.getElementById('storeMinimum');
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
// Authoritative cart quote records are independent of browse-page coverage.
const cartListings = new Map();
let inventoryCursor = null;
let inventoryAsOf = null;
let inventoryPageBusy = false;
let activeCatalog = 'all';
let checkoutLive = false;
let checkoutBusy = false;
let checkoutFailure = '';
let quoteRequest = 0;
let storeRequest = 0;
let acceptedQuoteVersion = null;
let acceptedSubtotalCents = null;
let priceReviewRequired = false;
let cart = readCart();
const checkoutReturn = new URLSearchParams(location.search).get('checkout');
let receiptMessage = '';
let receiptBlocked = false;
const CHECKOUT_INTENT_KEY = 'cambinos.store.checkout-intent.v1';
let pendingCheckoutIntent = readCheckoutIntent();
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
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return 'Price unavailable';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value)); }
  catch { return 'Price unavailable'; }
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

function listingSaleReady(listing) {
  return listing?.currency === 'USD' && listing.price !== null && listing.price !== undefined && typeof listing.price !== 'boolean' && String(listing.price).trim() !== '' && Number(listing.price) > 0 && Number.isSafeInteger(Math.round(Number(listing.price) * 100)) && Number.isSafeInteger(listing.quantity) && listing.quantity > 0;
}
function compareListingPrices(left, right, descending) {
  const a = listingSaleReady(left), b = listingSaleReady(right);
  if (a !== b) return a ? -1 : 1;
  return a ? (Number(left.price) - Number(right.price)) * (descending ? -1 : 1) : 0;
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
  if (checkoutBusy || readCheckoutIntent()) return;
  const listing = cartListings.get(listingId) || inventory.find((item) => item.id === listingId);
  const maximum = SHARED_SET_KINDS.includes(listing?.listingKind) ? 1 : Math.max(1, Number(listing?.quantity) || 1);
  const next = Math.max(0, Math.min(maximum, Math.floor(quantity)));
  cart = cart.filter((item) => item.listingId !== listingId);
  if (next > 0) cart.push({ listingId, quantity: next });
  saveCart();
}

function addToCart(listing) {
  if (!listingSaleReady(listing)) return;
  const current = cartEntry(listing.id)?.quantity || 0;
  setCartQuantity(listing.id, current + 1);
  cartDialog.showModal();
}

function addSetSelection(listing, quote, cardIndex) {
  if (checkoutBusy || readCheckoutIntent()) return;
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
  if (listingSaleReady(listing) && priceCents(listing) < ADD_ON_CENTS) visual.append(element('span', 'store-card-addon', 'Add-on card'));

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
  price.append(element('strong', '', listingSaleReady(listing) ? money(listing.price, listing.currency) : 'Price unavailable'));
  const included = listing.includedTotalItems;
  price.append(element('span', '', included ? `${included} items included · ${listing.quantity} in stock` : `${listing.quantity} in stock`));
  const actions = element('div', 'store-card-actions');
  const detailsLink = element('a', 'store-details-link', 'Details');
  detailsLink.href = `${APP_ORIGIN}/marketplace-dossier?listingId=${encodeURIComponent(listing.id)}`;
  detailsLink.setAttribute('aria-label', `View details for ${listing.title}`);
  const buy = element('button', 'button store-buy-button', cartEntry(listing.id) ? 'Add another' : 'Add to cart');
  buy.type = 'button';
  if (!listingSaleReady(listing)) { buy.disabled = true; buy.textContent = 'Price or stock unavailable'; }
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
  minus.disabled = checkoutBusy;
  minus.setAttribute('aria-label', `Remove one ${listing.title}`);
  minus.addEventListener('click', () => setCartQuantity(listing.id, quantity - 1));
  const value = element('span', '', String(quantity));
  value.setAttribute('aria-label', `${quantity} in cart`);
  const plus = element('button', '', '+');
  plus.type = 'button';
  plus.disabled = checkoutBusy || SHARED_SET_KINDS.includes(listing.listingKind) || quantity >= listing.quantity;
  plus.setAttribute('aria-label', `Add one ${listing.title}`);
  plus.addEventListener('click', () => setCartQuantity(listing.id, quantity + 1));
  controls.append(minus, value, plus);
  const lineTotal = element('strong', 'store-cart-line-total', money(Number(listing.price) * quantity, listing.currency));
  row.append(imageWrap, info, controls, lineTotal);
  return row;
}

async function verifyCart() {
  if (!cart.length || checkoutBusy || pendingCheckoutIntent) return;
  const request = ++quoteRequest;
  const checkedCart = JSON.stringify(cart);
  try {
    const response = await fetch(`${API_ORIGIN}/api/storefront/cart/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart }),
    });
    const payload = await response.json();
    if (request !== quoteRequest || checkoutBusy || checkedCart !== JSON.stringify(cart) || readCheckoutIntent()) return;
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
    if (typeof payload.data?.quoteVersion !== 'string' || !/^[a-f0-9]{64}$/.test(payload.data.quoteVersion)) throw new Error('Current price confirmation is unavailable.');
    let repriced = false;
    for (const line of payload.data.items || []) {
      const entry = cart.find(item => item.listingId === line.listing.id);
      const original = cartListings.get(line.listing.id) || inventory.find(item => item.id === line.listing.id);
      if (!entry || !Number.isSafeInteger(line.unitCents) || line.unitCents <= 0 || line.listing.currency !== 'USD') throw new Error('Current cart price could not be confirmed.');
      const shown = entry.quoteVersion && entry.display ? entry.display : original;
      if (!shown || Math.round(Number(shown.price) * 100) !== line.unitCents || shown.currency !== line.listing.currency) {
        if (entry.quoteVersion) entry.display = { ...entry.display, price: line.unitCents / 100, currency: line.listing.currency };
        else if (original) Object.assign(original, { price: line.unitCents / 100, currency: line.listing.currency });
        repriced = true;
      }
      cartListings.set(line.listing.id, { ...line.listing, price: line.unitCents / 100 });
    }
    if (repriced) {
      priceReviewRequired = true;
      renderInventory();
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }
    renderCart(false);
    acceptedQuoteVersion = payload.data.quoteVersion;
    acceptedSubtotalCents = Number.isSafeInteger(payload.data.subtotalCents) ? payload.data.subtotalCents : null;
    checkoutButton.disabled = receiptBlocked || !checkoutLive || payload.data?.checkoutEligible !== true;
    checkoutButton.textContent = priceReviewRequired ? 'Accept updated prices' : checkoutLive ? 'Continue to secure checkout' : 'Checkout is being activated';
    cartMessage.textContent = payload.data?.issues?.length
      ? payload.data.issues.map(issue => issue.message).join(' ')
      : payload.data?.checkoutEligible
      ? checkoutLive ? 'Inventory and pricing verified. Ready for secure checkout.' : 'Inventory and pricing verified. Secure payment connection is the remaining step.'
      : payload.data?.minimumMessage || 'Add more merchandise to reach the $10 minimum.';
    if (receiptBlocked) cartMessage.textContent = receiptMessage;
    if (priceReviewRequired && !receiptBlocked) cartMessage.textContent = 'Prices changed. Review the updated item prices and subtotal, then accept them before continuing.';
    if (checkoutFailure) cartMessage.textContent = checkoutFailure + ' ' + cartMessage.textContent;
  } catch (error) {
    if (request !== quoteRequest || checkoutBusy || checkedCart !== JSON.stringify(cart)) return;
    checkoutButton.disabled = true;
    cartMessage.textContent = (error instanceof Error ? error.message : 'Cart could not be verified.') + ' Refresh availability and select your cards again before checkout.';
  }
}

function renderCart(verify = true) {
  pendingCheckoutIntent = readCheckoutIntent();
  if (pendingCheckoutIntent) {
    ++quoteRequest;
    const savedCount = (pendingCheckoutIntent.items || []).reduce((sum, item) => sum + (Number.isSafeInteger(item.quantity) ? item.quantity : 0), 0);
    cartCount.textContent = savedCount ? String(savedCount) : '!';
    cartCount.setAttribute('aria-label', 'Saved checkout requires review');
    minimumPanel.hidden = true;
    cartItems.replaceChildren(element('p', '', savedCount ? savedCount + ' item(s) in this saved checkout.' : 'Saved checkout needs support review.'));
    cartEmpty.hidden = true; cartSummary.hidden = false;
    cartSubtotal.textContent = pendingCheckoutIntent.subtotalCents ? money(pendingCheckoutIntent.subtotalCents / 100) : 'Saved checkout';
    cartMessage.textContent = pendingCheckoutIntent.status === 'paid' ? 'Payment confirmed. Clear this completed checkout to start a new cart.' : ['expired', 'not_started'].includes(pendingCheckoutIntent.status) ? pendingCheckoutIntent.status === 'not_started' ? 'No checkout was created. Review current prices and availability before trying again.' : 'Verified checkout expired without payment. Review your saved cart before trying again.' : 'An earlier checkout needs verification. Resume it instead of placing another order.';
    checkoutButton.textContent = pendingCheckoutIntent.status === 'paid' ? 'Clear paid cart and start a new cart' : ['expired', 'not_started'].includes(pendingCheckoutIntent.status) ? 'Review saved cart' : 'Resume checkout';
    checkoutButton.disabled = checkoutBusy || pendingCheckoutIntent.invalid === true;
    return;
  }
  minimumPanel.hidden = false;
  if (verify) { acceptedQuoteVersion = null; ++quoteRequest; }
  checkoutButton.disabled = true;
  const valid = cart.map((entry) => {
    const original = cartListings.get(entry.listingId) || inventory.find(item => item.id === entry.listingId);
    return { entry, listing: original && entry.quoteVersion && entry.display
      ? { ...original, title: entry.display.title, price: entry.display.price, currency: entry.display.currency } : original };
  }).filter(item => item.listing);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = valid.reduce((sum, item) => sum + priceCents(item.listing) * item.entry.quantity, 0);
  cartCount.textContent = String(totalItems);
  cartCount.setAttribute('aria-label', `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`);
  cartItems.replaceChildren(...valid.map(({ entry, listing }) => cartLine(listing, entry.quantity)));
  for (const entry of cart.filter(entry => !valid.some(item => item.entry.listingId === entry.listingId))) {
    const pending = element('article', 'store-cart-line', entry.quantity + ' saved item(s) awaiting current details.');
    const remove = element('button', 'button button-secondary', 'Remove saved item'); remove.type = 'button'; remove.disabled = checkoutBusy;
    remove.addEventListener('click', () => setCartQuantity(entry.listingId, 0)); pending.append(remove); cartItems.append(pending);
  }
  cartEmpty.hidden = cart.length > 0;
  cartSummary.hidden = cart.length === 0;
  if (checkoutBusy) {
    checkoutButton.textContent = 'Opening secure checkout…';
    cartMessage.textContent = 'Verifying inventory and creating your protected Stripe checkout.';
    return;
  }
  if (!cart.length) return;
  if (valid.length !== cart.length) {
    cartSubtotal.textContent = 'Awaiting current prices'; minimumText.textContent = 'Checking saved items'; minimumProgress.style.width = '0%';
    checkoutButton.textContent = 'Verify saved cart'; cartMessage.textContent = 'Loading current details for saved items, independently of browse pages.';
    if (verify) void verifyCart();
    return;
  }
  cartSubtotal.textContent = money(subtotalCents / 100);
  const remaining = Math.max(0, MINIMUM_CENTS - subtotalCents);
  minimumProgress.style.width = `${Math.min(100, (subtotalCents / MINIMUM_CENTS) * 100)}%`;
  minimumText.textContent = remaining > 0 ? `Add ${money(remaining / 100)} to reach checkout` : 'Order minimum reached';
  checkoutButton.disabled = true;
  checkoutButton.textContent = subtotalCents < MINIMUM_CENTS ? `Add ${money(remaining / 100)} more` : checkoutLive ? 'Continue to secure checkout' : 'Checkout is being activated';
  cartMessage.textContent = subtotalCents < MINIMUM_CENTS ? 'Low-cost singles can be combined with any other store inventory.' : 'Checking current inventory and pricing…';
  if (verify) void verifyCart();
}

function readCheckoutIntent() {
  try {
    const raw = localStorage.getItem(CHECKOUT_INTENT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || !/^[a-f0-9]{64}$/.test(value.intentKey) || !/^[a-f0-9]{64}$/.test(value.quoteVersion) || !Array.isArray(value.items) || !value.items.length) return { invalid: true };
    return value;
  } catch { return { invalid: true }; }
}
function persistCheckoutIntent(value) {
  const serialized = JSON.stringify(value);
  localStorage.setItem(CHECKOUT_INTENT_KEY, serialized);
  if (localStorage.getItem(CHECKOUT_INTENT_KEY) !== serialized) throw new Error('Checkout recovery could not be saved. No new checkout will be submitted.');
  pendingCheckoutIntent = value;
}
function finishRecoveredCheckout() {
  const current = readCheckoutIntent();
  if (!current || current.intentKey !== pendingCheckoutIntent.intentKey || !['paid', 'expired', 'not_started'].includes(current.status)) throw new Error('Checkout recovery changed. Refresh before continuing.');
  // Retire this order's legacy receipt before releasing its durable guard.
  // On cleanup failure keep the intent, preventing old quantities being replayed.
  const snapshotRaw = sessionStorage.getItem(CHECKOUT_SNAPSHOT_KEY);
  const snapshot = snapshotRaw ? JSON.parse(snapshotRaw) : null;
  if (snapshot?.orderId === current.orderId) {
    sessionStorage.removeItem(CHECKOUT_SNAPSHOT_KEY);
    if (sessionStorage.getItem(CHECKOUT_SNAPSHOT_KEY)) throw new Error('Receipt cleanup failed. Keep this checkout for recovery.');
  }
  if (current.receiptSessionId && sessionStorage.getItem(RECEIPT_SESSION_KEY) === current.receiptSessionId) {
    sessionStorage.removeItem(RECEIPT_SESSION_KEY);
    if (sessionStorage.getItem(RECEIPT_SESSION_KEY) === current.receiptSessionId) throw new Error('Receipt cleanup failed. Keep this checkout for recovery.');
  }
  const returnParams = new URLSearchParams(location.search);
  if (current.receiptSessionId && returnParams.get('session_id') === current.receiptSessionId) {
    returnParams.delete('session_id');
    history.replaceState(null, '', location.pathname + (returnParams.size ? '?' + returnParams.toString() : '') + location.hash);
  }
  if (current.status === 'paid') {
    const completedKey = 'cambinos.store.completed-receipt.v1:' + current.orderId;
    localStorage.setItem(completedKey, 'paid');
    if (localStorage.getItem(completedKey) !== 'paid') throw new Error('Receipt completion could not be saved. Keep this checkout for recovery.');
    localStorage.setItem(CART_KEY, '[]'); cart = [];
  }
  localStorage.removeItem(CHECKOUT_INTENT_KEY);
  if (localStorage.getItem(CHECKOUT_INTENT_KEY)) throw new Error('Checkout recovery could not be cleared. Refresh before continuing.');
  pendingCheckoutIntent = null; receiptBlocked = false; receiptMessage = ''; checkoutFailure = '';
  renderCart();
}

async function startCheckout() {
  if (!navigator.locks?.request) { cartMessage.textContent = 'Safe checkout coordination is unavailable in this browser. Use a supported browser before paying.'; return; }
  return navigator.locks.request('cambinos-store-checkout', { mode: 'exclusive' }, runCheckoutIntent);
}

async function runCheckoutIntent() {
  if (checkoutBusy) return;
  pendingCheckoutIntent = readCheckoutIntent();
  if (pendingCheckoutIntent?.invalid) { cartMessage.textContent = 'Saved checkout recovery is unavailable. Contact support before paying again.'; return; }
  const finishingRecovery = pendingCheckoutIntent && ['paid', 'expired', 'not_started'].includes(pendingCheckoutIntent.status);
  if (!pendingCheckoutIntent && (!cart.length || checkoutButton.disabled || receiptBlocked || !acceptedQuoteVersion)) return;
  if (!pendingCheckoutIntent && priceReviewRequired) {
    priceReviewRequired = false;
    checkoutButton.textContent = 'Continue to secure checkout';
    cartMessage.textContent = 'Updated prices accepted. Continue to secure checkout when ready.';
    return;
  }
  try {
    if (!pendingCheckoutIntent) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const intentKey = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      persistCheckoutIntent({ intentKey, quoteVersion: acceptedQuoteVersion, items: JSON.parse(JSON.stringify(cart)), subtotalCents: acceptedSubtotalCents, status: 'pending' });
    }
    const submitted = pendingCheckoutIntent;
    checkoutBusy = true; checkoutFailure = ''; ++quoteRequest; renderCart();
    checkoutButton.textContent = 'Verifying saved checkout…';
    const response = await fetch(API_ORIGIN + '/api/storefront/cart/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: submitted.items, quoteVersion: submitted.quoteVersion, intentKey: submitted.intentKey }),
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success || !payload.data?.orderId) throw new Error(payload.error || 'Checkout could not be verified. Resume this checkout; do not place another order.');
    const state = payload.data;
    if (!['open', 'paid', 'expired', 'not_started'].includes(state.status)) throw new Error('Checkout remains uncertain. Resume or contact support before paying again.');
    persistCheckoutIntent({ ...submitted, orderId: state.orderId, status: state.status, receiptSessionId: state.sessionId ?? submitted.receiptSessionId });
    if (state.status !== 'open') { checkoutBusy = false; if (finishingRecovery) finishRecoveredCheckout(); else renderCart(); return; }
    const destination = new URL(state.checkoutUrl);
    if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com' || destination.username || destination.password || destination.port) throw new Error('Checkout returned an unexpected destination. Contact support.');
    try { sessionStorage.setItem(CHECKOUT_SNAPSHOT_KEY, JSON.stringify({ orderId: state.orderId, items: submitted.items })); } catch { /* Durable intent remains saved. */ }
    location.assign(destination.href);
  } catch (error) {
    checkoutBusy = false;
    checkoutFailure = error instanceof Error ? error.message : 'Checkout could not be verified. Resume before starting another order.';
    renderCart(); cartMessage.textContent = checkoutFailure;
  }
}

async function verifyCheckoutReturn() {
  const params = new URLSearchParams(location.search);
  let sessionId = params.get('session_id');
  let receiptSaved = false;
  try {
    if (sessionId) sessionStorage.setItem(RECEIPT_SESSION_KEY, sessionId);
    else sessionId = sessionStorage.getItem(RECEIPT_SESSION_KEY);
    receiptSaved = Boolean(sessionId && sessionStorage.getItem(RECEIPT_SESSION_KEY) === sessionId);
  } catch { /* Private browsing can restrict session storage. */ }
  if (!sessionId || !/^cs_[a-zA-Z0-9_]{4,240}$/.test(sessionId)) return;
  // Remove the receipt capability from the address bar and copied links.
  if (receiptSaved) {
    params.delete('session_id');
    history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash);
  }
  receiptBlocked = true;
  checkoutButton.disabled = true;
  status.hidden = false;
  receiptMessage = 'Checking your payment securely. Please do not place this order again yet.';
  status.lastElementChild.textContent = receiptMessage;
  try {
    const response = await fetch(`${API_ORIGIN}/api/storefront/checkout/receipt`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      cache: 'no-store', signal: AbortSignal.timeout(15000), body: JSON.stringify({ sessionId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error('unverified');
    if (payload.data?.status === 'paid' && typeof showReceiptShipment === 'function') showReceiptShipment(sessionId);
    if (pendingCheckoutIntent && pendingCheckoutIntent.orderId === payload.data?.orderId && ['paid', 'expired'].includes(payload.data.status)) {
      const expectedIntent = pendingCheckoutIntent.intentKey;
      if (!navigator.locks?.request) throw new Error('Checkout recovery coordination is unavailable.');
      await navigator.locks.request('cambinos-store-checkout', { mode: 'exclusive' }, () => {
        const current = readCheckoutIntent();
        if (current?.intentKey === expectedIntent && current.orderId === payload.data.orderId) {
          persistCheckoutIntent({ ...current, status: payload.data.status });
          receiptMessage = payload.data.status === 'paid' ? 'Payment confirmed. Open your cart to finish recovery.' : 'Checkout expired without payment. Open your cart to review it.';
        } else {
          pendingCheckoutIntent = current;
          receiptBlocked = Boolean(current);
          receiptMessage = 'This earlier checkout was already reviewed or changed in another tab. Your current cart was not changed.';
        }
      });
      status.lastElementChild.textContent = receiptMessage;
      return;
    }
    if (payload.data?.status === 'paid') {
      receiptMessage = 'Payment confirmed. Thank you! Cambinos has reserved your purchased cards for fulfillment.';
      try {
        const snapshot = JSON.parse(sessionStorage.getItem(CHECKOUT_SNAPSHOT_KEY) || 'null');
        if (snapshot?.orderId === payload.data.orderId && Array.isArray(snapshot.items)) {
          receiptBlocked = false;
          const alreadyCompleted = localStorage.getItem('cambinos.store.completed-receipt.v1:' + payload.data.orderId) === 'paid';
          const selectionKey = item => JSON.stringify([item.listingId, item.quoteVersion || null, item.cardIndex ?? null]);
          const purchased = new Map(snapshot.items.map(item => [selectionKey(item), item.quantity]));
          if (!alreadyCompleted) {
            cart = readCart().map(item => ({ ...item, quantity: Math.max(0, item.quantity - (purchased.get(selectionKey(item)) || 0)) })).filter(item => item.quantity > 0);
            localStorage.setItem(CART_KEY, JSON.stringify(cart));
          }
          sessionStorage.removeItem(CHECKOUT_SNAPSHOT_KEY);
        }
        if (!receiptBlocked) sessionStorage.removeItem(RECEIPT_SESSION_KEY);
        else receiptMessage = 'Payment confirmed, but this saved cart could not be matched. Contact support before paying for these items again.';
      } catch { /* Never turn a confirmed payment into a failure because storage is unavailable. */ }
    } else if (payload.data?.status === 'expired') {
      receiptBlocked = false;
      receiptMessage = 'This checkout expired without payment. Your saved cart can be reviewed again.';
      try { sessionStorage.removeItem(RECEIPT_SESSION_KEY); } catch { /* Optional storage. */ }
    } else {
      receiptMessage = 'Payment is still pending. Refresh this page to check again; do not pay twice.';
    }
  } catch {
    receiptMessage = 'We could not verify payment yet. Check your Stripe confirmation or contact support before paying again.';
  }
  if (!receiptSaved) receiptMessage += ' Browser storage is unavailable: keep this private checkout address until payment is verified.';
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
  catalogSummary.textContent = activeCatalog === 'all' ? 'Loaded products' : `${selectedCatalog} loaded inventory`;
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
    if (sortSelect.value === 'price-low') return compareListingPrices(left, right, false);
    if (sortSelect.value === 'price-high') return compareListingPrices(left, right, true);
    if (sortSelect.value === 'name') return left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' });
    return String(right.publishedAt || '').localeCompare(String(left.publishedAt || ''));
  });
  grid.replaceChildren(...visible.map(productCard));
  empty.hidden = inventory.length > 0;
  resultsSummary.textContent = `${visible.length} ${visible.length === 1 ? 'listing' : 'listings'} shown${activeCatalog === 'all' ? '' : ` in ${catalogLabel(activeCatalog)}`}${inventoryCursor ? ' among loaded inventory. Load more to search and sort older listings.' : ''}`;
  if (!visible.length && inventory.length) {
    grid.append(element('p', 'store-no-results', inventoryCursor ? 'No matches among loaded listings. More inventory is available below; load it before concluding there are no matches.' : `No ${activeCatalog === 'all' ? 'official inventory' : catalogLabel(activeCatalog) + ' inventory'} matches these filters. Try another catalog, set, or search.`));
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

function validateInventoryPage(payload) {
  const page = payload?.data;
  if (payload?.success !== true || !page || !Array.isArray(page.listings) || typeof page.asOf !== 'string' ||
      (page.nextCursor !== null && (typeof page.nextCursor !== 'string' || !page.nextCursor))) throw new Error('Inventory paging unavailable.');
  return page;
}
function renderInventoryPageState(message) {
  pageMessage.hidden = false;
  pageMessage.textContent = message || (inventoryCursor ? `${inventory.length} listings loaded. Catalog counts, filters and sorting cover loaded inventory only.` : `${inventory.length} listings loaded. End of this browse session. Refresh for new or changed inventory.`);
  loadMoreButton.hidden = !inventoryCursor;
  loadMoreButton.disabled = inventoryPageBusy;
  loadMoreButton.textContent = inventoryPageBusy ? 'Loading inventory…' : 'Load more inventory';
}
async function loadMoreInventory() {
  if (!inventoryCursor || inventoryPageBusy || checkoutBusy) return;
  const cursor = inventoryCursor, request = storeRequest;
  inventoryPageBusy = true; renderInventoryPageState();
  try {
    const response = await fetch(`${API_ORIGIN}/api/storefront/listings/page?limit=100&cursor=${encodeURIComponent(cursor)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (request !== storeRequest || cursor !== inventoryCursor) return;
    if (!response.ok) throw new Error('Inventory page unavailable.');
    const page = validateInventoryPage(payload);
    if (page.asOf !== inventoryAsOf || page.nextCursor === cursor) throw new Error('Inventory page changed.');
    const ids = new Set(inventory.map(item => item.id));
    inventory.push(...page.listings.filter(item => !ids.has(item.id)));
    inventoryCursor = page.nextCursor;
    renderFilters(); renderSetOptions(); renderInventory();
    inventoryPageBusy = false; renderInventoryPageState();
  } catch {
    if (request !== storeRequest) return;
    inventoryPageBusy = false;
    renderInventoryPageState('More inventory could not be loaded. Your current listings and filters are retained; retry Load more inventory.');
  }
}
async function loadStore() {
  if (checkoutBusy) return;
  const request = ++storeRequest;
  inventoryCursor = null; inventoryAsOf = null; inventoryPageBusy = false;
  loadMoreButton.hidden = true; pageMessage.hidden = true;
  checkoutLive = false;
  ++quoteRequest;
  checkoutButton.disabled = true;
  grid.replaceChildren();
  empty.hidden = true;
  errorPanel.hidden = true;
  status.className = 'store-status';
  status.lastElementChild.textContent = 'Connecting to official Cambinos inventory…';
  try {
    const [listingResponse, statusResponse] = await Promise.all([
      fetch(`${API_ORIGIN}/api/storefront/listings/page?limit=100`, { cache: 'no-store', signal: AbortSignal.timeout(15000) }),
      fetch(`${API_ORIGIN}/api/storefront/status`),
    ]);
    const listingPayload = await listingResponse.json();
    const statusPayload = await statusResponse.json();
    if (request !== storeRequest) return;
    if (!listingResponse.ok || !listingPayload.success) throw new Error('Inventory unavailable');
    const page = validateInventoryPage(listingPayload);
    inventory = page.listings; inventoryCursor = page.nextCursor; inventoryAsOf = page.asOf;
    const live = statusResponse.ok && statusPayload.success === true && statusPayload.data?.checkout === 'live';
    const fulfillmentLive = statusResponse.ok && statusPayload.data?.fulfillment === 'live';
    checkoutLive = live;
    status.className = `store-status ${live ? 'is-live' : 'is-preparing'}`;
    status.lastElementChild.textContent = receiptMessage || (live
      ? checkoutReturn === 'success' ? 'You’ve returned from checkout. Check your payment confirmation before ordering again. Contact support if you are unsure.' : checkoutReturn === 'cancelled' ? 'Checkout was cancelled. Your saved cart is still here.' : fulfillmentLive ? 'Protected checkout and fulfillment are live.' : 'Secure checkout is live. Shipping details are protected in Stripe.'
      : 'Official inventory is open for browsing. Protected checkout is being connected.');
    renderFilters();
    renderSetOptions();
    renderInventory();
    renderInventoryPageState();
    renderCart();
  } catch (_error) {
    if (request !== storeRequest) return;
    checkoutLive = false;
    ++quoteRequest;
    checkoutButton.disabled = true;
    status.lastElementChild.textContent = 'Official inventory connection needs attention.';
    errorPanel.hidden = false;
  }
}

launchForm.addEventListener('submit', joinAppLaunchList);
cartButton.addEventListener('click', () => { renderCart(); cartDialog.showModal(); });
cartClose.addEventListener('click', () => cartDialog.close());
checkoutButton.addEventListener('click', startCheckout);
if (STORE_PAUSED) {
  checkoutLive = false;
  cart = [];
  cartButton.disabled = !pendingCheckoutIntent;
  void verifyCheckoutReturn();
} else {
  search.addEventListener('input', renderInventory);
  setFilter.addEventListener('change', renderInventory);
  typeFilter.addEventListener('change', renderInventory);
  sortSelect.addEventListener('change', renderInventory);
  clearFilters.addEventListener('click', resetStoreFilters);
  retry.addEventListener('click', loadStore);
  loadMoreButton.addEventListener('click', loadMoreInventory);

  cartDialog.addEventListener('click', (event) => { if (event.target === cartDialog) cartDialog.close(); });
  void verifyCheckoutReturn().then(loadStore);
}
