const authScript = document.createElement('script'); authScript.src = 'dashboard-auth.js'; document.head.appendChild(authScript);
const apiBase = '';
const formatMoney = value => `₦${Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toast = document.getElementById('toast');
let farmerName = '';
let toastTimer;

function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
async function request(path) { const response = await fetch(`${apiBase}${path}`); const text = await response.text(); const body = text ? JSON.parse(text) : {}; if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`); return body; }

async function loadFarmer() {
  const data = await request(`/api/farmer?name=${encodeURIComponent(farmerName)}`);
  const orders = data.orders;
  document.getElementById('listingCount').textContent = data.produce.length;
  document.getElementById('stockCount').textContent = data.produce.reduce((total, item) => total + Number(item.quantity), 0).toLocaleString();
  document.getElementById('orderCount').textContent = orders.length;
  document.getElementById('orderValue').textContent = formatMoney(orders.reduce((total, order) => total + Number(order.value), 0));
  document.getElementById('listingRows').innerHTML = data.produce.map(item => `<tr><td><strong>${item.name}</strong><small>${item.id}</small></td><td>${item.region}</td><td>${Number(item.quantity).toLocaleString()} kg</td><td>${formatMoney(Number(item.price) * 1500)}</td><td><span class="status">${item.status}</span></td></tr>`).join('') || '<tr><td colspan="5">No listings found for this farm.</td></tr>';
  document.getElementById('orderRows').innerHTML = orders.map(order => `<tr><td><strong>${order.id}</strong><small>${order.quantity || ''} kg</small></td><td>${order.buyer}</td><td>${order.item}</td><td><span class="status">${order.deliveryStatus || order.status}</span></td><td><span class="status status-${(order.paymentStatus || 'Held').toLowerCase()}">${order.paymentStatus || 'Held'}</span></td></tr>`).join('') || '<tr><td colspan="5">No orders have been placed for your produce yet.</td></tr>';
  document.getElementById('farmerGate').hidden = true;
  document.getElementById('farmerContent').hidden = false;
}

document.getElementById('farmerForm').addEventListener('submit', async event => { event.preventDefault(); farmerName = new FormData(event.target).get('name').trim(); try { await loadFarmer(); } catch (error) { showToast(error.message); } });
document.getElementById('changeFarmer').addEventListener('click', () => { farmerName = ''; document.getElementById('farmerContent').hidden = true; document.getElementById('farmerGate').hidden = false; document.getElementById('farmerName').focus(); });
