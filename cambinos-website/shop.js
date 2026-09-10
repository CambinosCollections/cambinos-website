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
const retry = document.getElementById('storeRetry');
let inventory = [];
let activeCategory = 'All';

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
    visual.append(element('span', 'store-card-placeholder', 'C'));
  }
  const badge = element('span', 'store-card-badge', listing.product?.isSealed ? 'Sealed' : label(listing.listingKind));
  visual.append(badge);

  const body = element('div', 'store-card-body');
  body.append(element('p', 'store-card-category', listing.product?.category || 'Collectible'));
  body.append(element('h3', '', listing.title));
  const details = [listing.product?.setName, listing.product?.itemNumber ? `#${listing.product.itemNumber}` : null, listing.product?.edition].filter(Boolean).join(' · ');
  if (details) body.append(element('p', 'store-card-details', details));
  if (listing.description) body.append(element('p', 'store-card-description', listing.description));

  const footer = element('div', 'store-card-footer');
  const price = element('div', 'store-card-price');
  price.append(element('strong', '', money(listing.price, listing.currency)));
  const count = listing.includedTotalItems || listing.quantity;
  price.append(element('span', '', `${count} ${count === 1 ? 'item' : 'items'} available`));
  const buy = element('a', 'button store-buy-button', 'View & buy');
  buy.href = `${APP_ORIGIN}/marketplace-dossier?listingId=${encodeURIComponent(listing.id)}`;
  buy.setAttribute('aria-label', `View and buy ${listing.title}`);
  footer.append(price, buy);
  body.append(footer);
  card.append(visual, body);
  return card;
}

function renderFilters() {
  const categories = ['All', ...new Set(inventory.map((item) => item.product?.category).filter(Boolean))];
  filters.replaceChildren(...categories.map((category) => {
    const button = element('button', `store-filter${category === activeCategory ? ' is-active' : ''}`, category);
    button.type = 'button';
    button.addEventListener('click', () => { activeCategory = category; renderFilters(); renderInventory(); });
    return button;
  }));
}

function renderInventory() {
  const query = search.value.trim().toLowerCase();
  const visible = inventory.filter((listing) => {
    if (activeCategory !== 'All' && listing.product?.category !== activeCategory) return false;
    if (!query) return true;
    return [listing.title, listing.description, listing.product?.name, listing.product?.setName, listing.product?.category]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });
  grid.replaceChildren(...visible.map(productCard));
  empty.hidden = inventory.length > 0 || query.length > 0 || activeCategory !== 'All';
  if (!visible.length && inventory.length) {
    grid.append(element('p', 'store-no-results', 'No official inventory matches that search. Try a different name or category.'));
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
      fetch(`${API_ORIGIN}/api/storefront/listings?limit=100`),
      fetch(`${API_ORIGIN}/api/storefront/status`),
    ]);
    const listingPayload = await listingResponse.json();
    const statusPayload = await statusResponse.json();
    if (!listingResponse.ok || !listingPayload.success) throw new Error('Inventory unavailable');
    inventory = Array.isArray(listingPayload.data) ? listingPayload.data : [];
    const live = statusResponse.ok && statusPayload.data?.checkout === 'live' && statusPayload.data?.fulfillment === 'live';
    status.className = `store-status ${live ? 'is-live' : 'is-preparing'}`;
    status.lastElementChild.textContent = live
      ? 'Protected checkout and fulfillment are live.'
      : 'Official inventory is open for browsing. Protected checkout is being connected.';
    renderFilters();
    renderInventory();
  } catch (_error) {
    status.lastElementChild.textContent = 'Official inventory connection needs attention.';
    errorPanel.hidden = false;
  }
}

search.addEventListener('input', renderInventory);
retry.addEventListener('click', loadStore);
loadStore();
