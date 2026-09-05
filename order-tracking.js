const apiBase = '';
const orderList = document.getElementById('orderList');
const toast = document.getElementById('toast');
let toastTimer;
let trackingEmail = '';

document.querySelectorAll('.nav-links').forEach(nav => {
  if (!nav.querySelector('a[href="order-tracking.html"]')) {
    const trackingLink = document.createElement('a');
    trackingLink.href = 'order-tracking.html';
    trackingLink.textContent = 'Track orders';
    trackingLink.className = 'active';
    nav.appendChild(trackingLink);
  }
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

async function loadOrders() {
  if (!trackingEmail) return;
  const [ordersResponse, routesResponse] = await Promise.all([fetch(`${apiBase}/api/orders?email=${encodeURIComponent(trackingEmail)}`), fetch(`${apiBase}/api/routes`)]);
  const orders = await ordersResponse.json();
  const routes = await routesResponse.json();
  const routeMap = Object.fromEntries(routes.map(route => [route.id, route.route]));
  orderList.innerHTML = orders.map(order => `<article class="order-card"><div><h3>${order.item}</h3><p>Order ${order.id} · ${order.buyer}<br>${order.routeId && routeMap[order.routeId] ? `Transport: ${routeMap[order.routeId]}<br>` : ''}Order value: $${Number(order.value).toLocaleString()}<br>Payment method: ${order.paymentMethod || 'Card (Stripe Escrow)'}</p><div class="order-meta"><span class="order-badge ${order.deliveryStatus === 'In transit' ? 'transit' : ''}">${order.deliveryStatus || order.status}</span><span class="order-badge ${order.paymentStatus === 'Held' ? 'held' : ''}">Payment: ${order.paymentStatus || 'Held'}</span></div>${order.deliveryStatus === 'Received' ? `<div class="receipt-confirmation"><strong>✓ Order received</strong><span>Receipt confirmed${order.receivedAt ? ` on ${new Date(order.receivedAt).toLocaleDateString()}` : ''}. Payment ${order.paymentStatus === 'Released' ? 'has been released.' : 'is being held in escrow for the farmer.'}</span></div>` : ''}</div>${order.status === 'Delivered' && order.deliveryStatus !== 'Received' ? `<button class="btn btn-green confirm-btn" data-order="${order.id}">Confirm received</button>` : order.deliveryStatus === 'Received' ? '<span class="order-badge">Receipt confirmed</span>' : '<span style="color:var(--muted);font-size:12px">Waiting for delivery</span>'}</article>`).join('');
  document.getElementById('noOrders').style.display = orders.length ? 'none' : 'block';
}

document.addEventListener('click', async event => {
  const orderId = event.target.dataset.order;
  if (!orderId) return;
  try {
    const response = await fetch(`${apiBase}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm-received', email: trackingEmail }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not confirm receipt');
    showToast('Receipt confirmed. The admin can now release payment.');
    await loadOrders();
  } catch (error) { showToast(error.message); }
});

document.getElementById('trackingForm').addEventListener('submit', async event => {
  event.preventDefault();
  trackingEmail = new FormData(event.target).get('email').trim().toLowerCase();
  try { await loadOrders(); document.getElementById('trackingGate').hidden = true; document.getElementById('ordersSection').hidden = false; } catch (error) { showToast(`Could not load orders: ${error.message}`); }
});

document.getElementById('changeEmail').addEventListener('click', () => {
  trackingEmail = '';
  document.getElementById('ordersSection').hidden = true;
  document.getElementById('trackingGate').hidden = false;
  document.getElementById('trackingEmail').focus();
});
