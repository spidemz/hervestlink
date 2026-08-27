const state = { data: null };
const toast = document.getElementById('toast');
let toastTimer;
const apiBase = location.port === '3000' ? '' : 'http://localhost:3000';

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function request(path, options) {
  const response = await fetch(`${apiBase}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error(`Server returned invalid JSON (${response.status})`); }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function renderStats(stats) {
  document.getElementById('farmerCount').textContent = stats.farmers.toLocaleString();
  document.getElementById('buyerCount').textContent = stats.buyers.toLocaleString();
  document.getElementById('produceCount').textContent = stats.activeProduce;
  document.getElementById('routeCount').textContent = stats.openRoutes;
}

function renderProduce(items) {
  document.getElementById('produceRows').innerHTML = items.map(item => `<tr><td><strong>${item.name}</strong><small>${item.id}</small></td><td>${item.farmer}</td><td>${item.region}</td><td>${item.quantity.toLocaleString()} kg</td><td>$${item.price.toFixed(2)}</td><td><span class="status status-${item.status.toLowerCase()}">${item.status}</span></td><td class="row-actions">${item.status === 'Review' ? `<button class="table-btn" data-approve="${item.id}">Approve</button>` : ''}<button class="delete-btn" data-delete="${item.id}" aria-label="Delete ${item.name}">×</button></td></tr>`).join('');
}

function renderRoutes(items) {
  document.getElementById('routeRows').innerHTML = items.map(item => `<tr><td><strong>${item.driver}</strong><small>${item.id}</small></td><td>${item.route}</td><td>${item.capacity}</td><td><span class="status status-open">${item.status}</span></td><td><button class="table-btn" data-book="${item.id}">Assign booking</button></td></tr>`).join('');
}

function renderOrders(items) {
  document.getElementById('orderRows').innerHTML = items.map(item => `<tr><td><strong>${item.buyer}</strong><small>${item.id}</small></td><td>${item.item}</td><td><span class="status status-${item.status.toLowerCase().replaceAll(' ', '-')}">${item.status}</span><small>Receipt: ${item.deliveryStatus || item.status}<br>Payment: ${item.paymentStatus || 'Held'} · ${item.paymentMethod || 'Card (Stripe Escrow)'}</small></td><td>$${item.value.toLocaleString()}</td><td>${item.deliveryStatus === 'Received' && item.paymentStatus !== 'Released' ? `<button class="table-btn" data-release="${item.id}">Release payment</button>` : item.paymentStatus === 'Released' ? '<span class="status status-released">Released</span>' : '<span style="color:var(--muted);font-size:10px">Waiting for receipt</span>'}</td></tr>`).join('');
}

async function loadDashboard() {
  state.data = await request('/api/dashboard');
  renderStats(state.data.stats);
  renderProduce(state.data.produce);
  renderRoutes(state.data.routes);
  renderOrders(state.data.orders);
  document.getElementById('lastUpdated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

document.addEventListener('click', async event => {
  const approveId = event.target.dataset.approve;
  const deleteId = event.target.dataset.delete;
  const bookId = event.target.dataset.book;
  const releaseId = event.target.dataset.release;
  try {
    if (approveId) { await request(`/api/produce/${approveId}`, { method: 'PATCH', body: JSON.stringify({ status: 'Active' }) }); showToast('Listing approved'); await loadDashboard(); }
    if (deleteId && confirm('Remove this produce listing?')) { await request(`/api/produce/${deleteId}`, { method: 'DELETE' }); showToast('Listing removed'); await loadDashboard(); }
    if (bookId) { await request(`/api/routes/${bookId}`, { method: 'PATCH', body: JSON.stringify({ status: 'Booked' }) }); showToast('Route booking assigned'); await loadDashboard(); }
    if (releaseId) { await request(`/api/orders/${releaseId}`, { method: 'PATCH', body: JSON.stringify({ action: 'release-payment' }) }); showToast('Payment released to the farmer'); await loadDashboard(); }
  } catch (error) { showToast(error.message); }
});

document.getElementById('produceForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await request('/api/produce', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) });
    event.target.reset();
    document.getElementById('produceDialog').close();
    showToast('New produce listing added');
    await loadDashboard();
  } catch (error) { showToast(error.message); }
});

document.getElementById('newProduceBtn').addEventListener('click', () => document.getElementById('produceDialog').showModal());
document.getElementById('closeDialog').addEventListener('click', () => document.getElementById('produceDialog').close());
document.getElementById('refreshBtn').addEventListener('click', async () => { await loadDashboard(); showToast('Dashboard refreshed'); });
loadDashboard().catch(error => showToast(`Could not load dashboard: ${error.message}`));
