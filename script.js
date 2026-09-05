const toast = document.getElementById('toast');
let toastTimer;
const isLocalPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBase = isLocalPreview && window.location.port !== '3000'
  ? 'http://localhost:3000'
  : '';

async function readJson(response) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error(`API returned HTML instead of JSON (${response.status}). Open the site through http://localhost:3000.`); }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

const siteNav = document.querySelector('.nav');
const siteNavLinks = document.querySelector('.nav-links');
if (siteNav && siteNavLinks && !document.getElementById('menuToggle')) {
  const menuToggle = document.createElement('button');
  menuToggle.id = 'menuToggle';
  menuToggle.className = 'menu-toggle';
  menuToggle.type = 'button';
  menuToggle.setAttribute('aria-label', 'Open navigation menu');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.innerHTML = '<span></span><span></span><span></span>';
  siteNav.insertBefore(menuToggle, siteNavLinks);
  menuToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('menu-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  });
}

document.querySelectorAll('.nav-links').forEach(nav => {
  if (!nav.querySelector('a[href="order-tracking.html"]')) {
    const trackingLink = document.createElement('a');
    trackingLink.href = 'order-tracking.html';
    trackingLink.textContent = 'Track orders';
    nav.appendChild(trackingLink);
  }
  if (!nav.querySelector('a[href="farmer-dashboard.html"]')) {
    const farmerLink = document.createElement('a');
    farmerLink.href = 'farmer-dashboard.html';
    farmerLink.textContent = 'Farmer dashboard';
    nav.appendChild(farmerLink);
  }
});

if (document.title.startsWith('Notifications')) {
  const trackingAction = document.querySelector('.form-panel a');
  if (trackingAction) {
    trackingAction.href = 'order-tracking.html';
    trackingAction.textContent = 'Track my orders →';
  }
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function loadNotifications() {
  const list = document.getElementById('notificationList');
  if (!list) return;
  try {
    const response = await fetch(`${apiBase}/api/notifications`);
    const notifications = await response.json();
    if (!response.ok) throw new Error(notifications.error || `Could not load notifications (${response.status})`);
    list.innerHTML = notifications.length ? notifications.map(notification => `<article class="notification-item ${notification.read ? '' : 'unread'}"><span class="notification-dot notification-${escapeHtml(notification.type)}"></span><div><p>${escapeHtml(notification.message)}</p><time datetime="${escapeHtml(notification.createdAt)}">${new Date(notification.createdAt).toLocaleString()}</time></div></article>`).join('') : '<div class="form-panel"><h2>Nothing new yet</h2><p style="color:var(--muted)">When an action is taken, you’ll see it here.</p><a class="btn btn-green" href="produce.html">Browse produce →</a></div>';
  } catch (error) {
    list.innerHTML = `<div class="form-panel"><h2>Could not load updates</h2><p style="color:var(--muted)">${escapeHtml(error.message)}</p></div>`;
  }
}

if (document.title.startsWith('Notifications')) {
  loadNotifications();
  document.getElementById('markNotificationsRead')?.addEventListener('click', async () => {
    await fetch(`${apiBase}/api/notifications/read-all`, { method: 'PATCH' });
    loadNotifications();
  });
}

document.querySelectorAll('.heart').forEach(button => button.addEventListener('click', () => {
  button.classList.toggle('active');
  button.textContent = button.classList.contains('active') ? '♥' : '♡';
  showToast(button.classList.contains('active') ? 'Saved to your shortlist' : 'Removed from your shortlist');
}));

document.querySelectorAll('.book-btn').forEach(button => button.addEventListener('click', () => showToast('Route request started. We’ll connect you with the driver.')));
document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.toast)));

function listingMarkup(item) {
  const imageMap = {
    'heirloom tomatoes': 'photo-1592924357228-91a4daadcfea',
    'organic avocados': 'photo-1523049673857-eb18f1d7b578',
    'golden sweet corn': 'photo-1551754655-cd27e38d2076',
    'red quinoa': 'photo-1586201375761-83865001e31c'
  };
  const image = item.image || `https://images.unsplash.com/${imageMap[item.name.toLowerCase()] || 'photo-1490474418585-ba9bad8fd0ea'}?auto=format&fit=crop&w=700&q=80`;
  const regionKey = { northern: 'north', central: 'central', coastal: 'coast' }[item.region.toLowerCase()] || 'all';
  return `<article class="listing" data-name="${item.name.toLowerCase()}" data-region="${regionKey}"><div class="listing-image" style="background-image:url('${image}')"><span>${item.status === 'Review' ? 'Pending review' : 'Available'}</span><button class="heart" aria-label="Save ${item.name}">♡</button></div><div class="listing-body"><h3>${item.name}</h3><p class="origin">${item.farmer} · ${item.region}</p><div class="listing-meta"><span class="price">$${Number(item.price).toFixed(2)} <small>/ kg</small></span><span class="qty">${Number(item.quantity).toLocaleString()} kg available</span></div><button class="btn btn-green order-btn" data-produce="${item.id}" data-name="${item.name}" data-price="${item.price}" data-quantity="${item.quantity}">Order now</button></div></article>`;
}

function setupOrderDialog() {
  if (!document.querySelector('.listing-grid') || document.getElementById('orderDialog')) return;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="orderDialog" class="order-dialog"><form id="orderForm" class="order-form"><div class="dialog-head"><h2>Place an order</h2><button type="button" class="close" id="closeOrderDialog" aria-label="Close">×</button></div><p id="orderProduct" class="order-product"></p><label for="buyerName">Your name or company</label><input id="buyerName" name="buyer" required placeholder="e.g. Metro Fresh Markets"><label for="buyerEmail">Email used for this order</label><input id="buyerEmail" name="email" type="email" required placeholder="you@example.com"><label for="orderQuantity">Quantity in kg</label><input id="orderQuantity" name="quantity" type="number" min="1" required><label for="routeChoice">Choose transport</label><select id="routeChoice" name="routeId" required></select><label for="paymentMethod">Payment method</label><select id="paymentMethod" name="paymentMethod"><option value="Card (Stripe Escrow)">Card · Stripe Escrow</option><option value="Bank transfer">Bank transfer</option><option value="Cash on delivery">Cash on delivery</option></select><p style="margin:8px 0 18px;color:var(--muted);font-size:12px;line-height:1.5;">Funds are held in escrow and released only after the buyer confirms receipt.</p><input type="hidden" name="produceId" id="orderProduceId"><button class="btn btn-green" type="submit">Place order →</button></form></dialog>`);
  document.getElementById('closeOrderDialog').addEventListener('click', () => document.getElementById('orderDialog').close());
  document.getElementById('orderForm').addEventListener('submit', submitOrder);
}

async function openOrderDialog(button) {
  setupOrderDialog();
  const response = await fetch(`${apiBase}/api/routes`);
  const routes = await readJson(response);
  const availableRoutes = routes.filter(route => route.status !== 'Booked');
  if (!availableRoutes.length) return showToast('No transport routes are available right now');
  document.getElementById('orderProduct').textContent = `${button.dataset.name} · $${Number(button.dataset.price).toFixed(2)} / kg`;
  document.getElementById('orderProduceId').value = button.dataset.produce;
  document.getElementById('orderQuantity').max = button.dataset.quantity;
  document.getElementById('orderQuantity').value = Math.min(10, Number(button.dataset.quantity));
  document.getElementById('routeChoice').innerHTML = availableRoutes.map(route => `<option value="${route.id}">${route.driver} · ${route.route} · ${route.capacity} left</option>`).join('');
  const dialog = document.getElementById('orderDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

async function submitOrder(event) {
  event.preventDefault();
  const response = await fetch(`${apiBase}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) });
  let result;
  try { result = await readJson(response); } catch (error) { return showToast(error.message); }
  const dialog = document.getElementById('orderDialog');
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  event.target.reset();
  showToast(`Order ${result.id} placed successfully. Payment is held in escrow until delivery is confirmed.`);
  await loadMarketplaceListings();
}

document.querySelectorAll('.listing').forEach(card => {
  if (card.querySelector('.order-btn')) return;
  const name = card.querySelector('h3')?.textContent.trim();
  const details = { 'Heirloom tomatoes': ['p-1001', 2.4, 850], 'Organic avocados': ['p-1002', 3.1, 420], 'Golden sweet corn': ['p-1003', 1.85, 1200], 'Red quinoa': ['p-1004', 4.6, 650] }[name];
  if (!details) return;
  const button = document.createElement('button');
  button.className = 'btn btn-green order-btn';
  button.textContent = 'Order now';
  button.dataset.produce = details[0];
  button.dataset.name = name;
  button.dataset.price = details[1];
  button.dataset.quantity = details[2];
  card.querySelector('.listing-body').append(button);
  button.addEventListener('click', () => openOrderDialog(button).catch(error => showToast(error.message)));
});

async function loadMarketplaceListings() {
  const grids = document.querySelectorAll('.listing-grid');
  if (!grids.length) return;
  try {
    const response = await fetch(`${apiBase}/api/produce`);
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : []; } catch { throw new Error(`Server returned invalid JSON (${response.status})`); }
    if (!response.ok) throw new Error(body.error || `Could not load listings (${response.status})`);
    const listings = body.filter(item => item.status === 'Active');
    grids.forEach(grid => { grid.innerHTML = listings.map(listingMarkup).join(''); });
    document.querySelectorAll('.heart').forEach(button => button.addEventListener('click', () => {
      button.classList.toggle('active');
      button.textContent = button.classList.contains('active') ? '♥' : '♡';
      showToast(button.classList.contains('active') ? 'Saved to your shortlist' : 'Removed from your shortlist');
    }));
    document.querySelectorAll('.order-btn').forEach(button => button.addEventListener('click', () => openOrderDialog(button).catch(error => showToast(error.message))));
    setupOrderDialog();
    filterListings();
  } catch (error) {
    showToast(error.message);
  }
}

const listingForm = document.getElementById('produceForm');
if (listingForm && listingForm.dataset.backend === 'true') {
  const imageInput = document.createElement('input');
  imageInput.id = 'produceImage';
  imageInput.name = 'image';
  imageInput.type = 'file';
  imageInput.accept = 'image/jpeg,image/png,image/webp';
  const imageLabel = document.createElement('label');
  imageLabel.htmlFor = 'produceImage';
  imageLabel.textContent = 'Produce picture';
  const imagePreview = document.createElement('img');
  imagePreview.className = 'produce-image-preview';
  imagePreview.alt = 'Selected produce preview';
  imagePreview.hidden = true;
  const quantityInput = document.getElementById('quantity');
  quantityInput.previousElementSibling.before(imageLabel, imageInput, imagePreview);
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) { imagePreview.hidden = true; imagePreview.removeAttribute('src'); return; }
    if (file.size > 5 * 1024 * 1024) { imageInput.value = ''; imagePreview.hidden = true; return showToast('Please choose an image smaller than 5 MB'); }
    imagePreview.src = URL.createObjectURL(file);
    imagePreview.hidden = false;
  });
  listingForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(listingForm);
    try {
      const values = Object.fromEntries(form.entries());
      if (values.image?.size) values.image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(values.image); });
      else delete values.image;
      const response = await fetch(`${apiBase}/api/produce`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const text = await response.text();
      let result;
      try { result = text ? JSON.parse(text) : {}; } catch { throw new Error(`Server returned invalid JSON (${response.status})`); }
      if (!response.ok) throw new Error(result.error || 'Could not publish listing');
      listingForm.reset();
      showToast('Your produce is now live on the marketplace');
    } catch (error) {
      showToast(error.message);
    }
  });
}

function filterListings() {
  const searchInput = document.getElementById('searchInput');
  const regionSelect = document.getElementById('regionSelect');
  if (!searchInput || !regionSelect) return;
  const term = searchInput.value.toLowerCase().trim();
  const region = regionSelect.value;
  let visible = 0;
  document.querySelectorAll('.listing').forEach(card => {
    const match = (!term || card.dataset.name.includes(term)) && (region === 'all' || card.dataset.region === region);
    card.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.style.display = visible ? 'none' : 'block';
}

document.getElementById('searchBtn')?.addEventListener('click', filterListings);
document.getElementById('searchInput')?.addEventListener('input', filterListings);
document.getElementById('regionSelect')?.addEventListener('change', filterListings);
loadMarketplaceListings();
