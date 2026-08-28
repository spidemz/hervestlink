const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { Pool } = require('pg');

const root = __dirname;
const dataPath = path.join(root, 'data.json');
const port = process.env.PORT || 3000;
const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;
let databaseReady;

function readData() {
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
}

async function readStoredData() {
  if (!pool) return readData();
  if (!databaseReady) {
    databaseReady = (async () => {
      await pool.query('CREATE TABLE IF NOT EXISTS app_state (id integer PRIMARY KEY, data jsonb NOT NULL)');
      const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
      if (!result.rowCount) await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [readData()]);
    })().catch(error => { databaseReady = null; throw error; });
  }
  await databaseReady;
  const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
  return result.rows[0].data;
}

async function writeStoredData(data) {
  if (!pool) return writeData(data);
  await pool.query('UPDATE app_state SET data = $1 WHERE id = 1', [data]);
}

function addNotification(data, message, type = 'update') {
  if (!Array.isArray(data.notifications)) data.notifications = [];
  data.notifications.unshift({ id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, message, type, read: false, createdAt: new Date().toISOString() });
  data.notifications = data.notifications.slice(0, 100);
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

function dashboard(data) {
  return {
    stats: {
      farmers: 1840,
      buyers: 326,
      activeProduce: data.produce.filter(item => item.status === 'Active').length,
      openRoutes: data.routes.filter(item => item.status === 'Open').length
    },
    produce: data.produce,
    routes: data.routes,
    orders: data.orders
  };
}

async function handleApi(request, response, requestUrl) {
  const data = await readStoredData();
  const segments = requestUrl.pathname.split('/').filter(Boolean);
  const collection = segments[1];
  const id = segments[2];

  if (request.method === 'GET' && requestUrl.pathname === '/api/dashboard') return sendJson(response, 200, dashboard(data));
  if (request.method === 'GET' && requestUrl.pathname === '/api/farmer') {
    const farmerName = requestUrl.searchParams.get('name')?.trim().toLowerCase();
    if (!farmerName) return sendJson(response, 400, { error: 'Farmer name is required' });
    const produce = data.produce.filter(item => item.farmer?.trim().toLowerCase() === farmerName);
    const produceIds = new Set(produce.map(item => item.id));
    return sendJson(response, 200, { farmer: farmerName, produce, orders: data.orders.filter(order => produceIds.has(order.produceId)) });
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/notifications') {
    return sendJson(response, 200, data.notifications || []);
  }
  if (request.method === 'PATCH' && requestUrl.pathname === '/api/notifications/read-all') {
    (data.notifications || []).forEach(notification => { notification.read = true; });
    await writeStoredData(data);
    return sendJson(response, 200, { success: true });
  }
  if (!['produce', 'routes', 'orders'].includes(collection)) return sendJson(response, 404, { error: 'Endpoint not found' });

  if (request.method === 'GET' && !id) {
    if (collection === 'orders') {
      const email = requestUrl.searchParams.get('email')?.trim().toLowerCase();
      if (!email) return sendJson(response, 400, { error: 'Email is required to view orders' });
      return sendJson(response, 200, data.orders.filter(order => order.email?.toLowerCase() === email));
    }
    return sendJson(response, 200, data[collection]);
  }
  if (request.method === 'POST' && collection === 'routes') {
    const body = await readBody(request);
    if (!body.driver || !body.route || !body.capacity) return sendJson(response, 400, { error: 'Driver, route, and capacity are required' });
    const route = { id: `r-${Date.now()}`, driver: body.driver, route: body.route, capacity: body.capacity, status: 'Open' };
    data.routes.unshift(route);
    addNotification(data, `New transport route published: ${route.route} by ${route.driver}.`, 'route');
    await writeStoredData(data);
    return sendJson(response, 201, route);
  }
  if (request.method === 'POST' && collection === 'orders') {
    const body = await readBody(request);
    const produce = data.produce.find(item => item.id === body.produceId && item.status === 'Active');
    const route = data.routes.find(item => item.id === body.routeId && item.status !== 'Booked');
    const quantity = Number(body.quantity);
    if (!produce || !body.buyer || !body.email || !route || !Number.isFinite(quantity) || quantity < 1 || quantity > produce.quantity) {
      return sendJson(response, 400, { error: 'Choose an available product, route, buyer, email, and valid quantity' });
    }
    const paymentMethod = String(body.paymentMethod || 'Card (Stripe Escrow)').trim() || 'Card (Stripe Escrow)';
    const order = {
      id: `o-${Date.now()}`,
      buyer: body.buyer,
      email: body.email.trim().toLowerCase(),
      item: produce.name,
      produceId: produce.id,
      routeId: route.id,
      quantity,
      status: 'Awaiting pickup',
      value: Number((quantity * produce.price).toFixed(2)),
      deliveryStatus: 'Awaiting pickup',
      paymentStatus: 'Held',
      paymentMethod,
      escrowStatus: 'Held in escrow'
    };
    produce.quantity -= quantity;
    route.status = 'Booked';
    data.orders.unshift(order);
    addNotification(data, `New order ${order.id} placed for ${order.item} by ${order.buyer}. Payment is held in escrow.`, 'order');
    await writeStoredData(data);
    return sendJson(response, 201, order);
  }
  if (request.method === 'PATCH' && collection === 'orders' && id) {
    const item = data.orders.find(entry => entry.id === id);
    if (!item) return sendJson(response, 404, { error: 'Order not found' });
    const body = await readBody(request);
    if (body.action === 'confirm-received' && (!body.email || !item.email || body.email.trim().toLowerCase() !== item.email.toLowerCase())) {
      return sendJson(response, 403, { error: 'That email does not match this order' });
    }
    if (body.action === 'confirm-received') {
      if (item.status !== 'Delivered') return sendJson(response, 409, { error: 'The order must be delivered before receipt can be confirmed' });
      item.deliveryStatus = 'Received';
      item.receivedAt = new Date().toISOString();
      addNotification(data, `Buyer confirmed receipt for order ${item.id}. Payment can now be released.`, 'order');
    } else if (body.action === 'release-payment') {
      if (item.deliveryStatus !== 'Received') return sendJson(response, 409, { error: 'Buyer confirmation is required before payment can be released' });
      item.paymentStatus = 'Released';
      item.paidAt = new Date().toISOString();
      addNotification(data, `Payment released to the farmer for order ${item.id}.`, 'payment');
    } else if (body.action === 'assign-route') {
      const route = data.routes.find(entry => entry.id === body.routeId && entry.status !== 'Completed');
      if (!route) return sendJson(response, 404, { error: 'Available driver route not found' });
      item.routeId = route.id;
      item.deliveryStatus = 'Awaiting pickup';
      item.status = 'Awaiting pickup';
      route.status = 'Booked';
      addNotification(data, `Order ${item.id} was assigned to the route ${route.route}.`, 'route');
    } else if (body.action === 'unassign-route') {
      if (!item.routeId) return sendJson(response, 400, { error: 'This order has no assigned route' });
      const route = data.routes.find(entry => entry.id === item.routeId);
      const previousRouteId = item.routeId;
      item.routeId = null;
      if (route && !data.orders.some(order => order.id !== item.id && order.routeId === previousRouteId && !['Delivered', 'Cancelled'].includes(order.status))) {
        route.status = 'Open';
      }
      addNotification(data, `Order ${item.id} was removed from its transport route.`, 'route');
    } else {
      return sendJson(response, 400, { error: 'Unknown order action' });
    }
    await writeStoredData(data);
    return sendJson(response, 200, item);
  }
  if (request.method === 'POST' && collection === 'produce') {
    const body = await readBody(request);
    if (!body.name || !body.farmer || !body.quantity || !body.price) return sendJson(response, 400, { error: 'Name, farmer, quantity, and price are required' });
    const item = { id: `p-${Date.now()}`, name: body.name, farmer: body.farmer, region: body.region || 'Central', quantity: Number(body.quantity), price: Number(body.price), status: 'Active', ...(body.image ? { image: body.image } : {}) };
    data.produce.unshift(item);
    addNotification(data, `New produce listing added: ${item.name} by ${item.farmer}.`, 'produce');
    await writeStoredData(data);
    return sendJson(response, 201, item);
  }
  if (request.method === 'PATCH' && collection === 'produce' && id) {
    const item = data.produce.find(entry => entry.id === id);
    if (!item) return sendJson(response, 404, { error: 'Produce listing not found' });
    const body = await readBody(request);
    Object.assign(item, body);
    addNotification(data, `Produce listing ${item.name} was updated.`, 'produce');
    await writeStoredData(data);
    return sendJson(response, 200, item);
  }
  if (request.method === 'DELETE' && collection === 'produce' && id) {
    const originalLength = data.produce.length;
    data.produce = data.produce.filter(entry => entry.id !== id);
    if (data.produce.length === originalLength) return sendJson(response, 404, { error: 'Produce listing not found' });
    addNotification(data, 'A produce listing was removed from the marketplace.', 'produce');
    await writeStoredData(data);
    return sendJson(response, 200, { success: true });
  }
  if (request.method === 'PATCH' && collection === 'routes' && id) {
    const item = data.routes.find(entry => entry.id === id);
    if (!item) return sendJson(response, 404, { error: 'Route not found' });
    const body = await readBody(request);
    Object.assign(item, body);
    if (item.status === 'Completed') {
      data.orders.filter(order => order.routeId === item.id && !['Delivered', 'Cancelled'].includes(order.status)).forEach(order => {
        order.status = 'Delivered';
        order.deliveryStatus = 'Awaiting confirmation';
        order.deliveredAt = new Date().toISOString();
      });
      addNotification(data, `Route ${item.route} was completed and assigned orders were marked delivered.`, 'route');
    } else {
      addNotification(data, `Route ${item.route} status changed to ${item.status}.`, 'route');
    }
    await writeStoredData(data);
    return sendJson(response, 200, item);
  }
  if (request.method === 'DELETE' && collection === 'routes' && id) {
    const assignedOrder = data.orders.find(order => order.routeId === id && !['Delivered', 'Cancelled'].includes(order.status));
    if (assignedOrder) return sendJson(response, 409, { error: 'This route has an active assigned load and cannot be deleted' });
    const originalLength = data.routes.length;
    data.routes = data.routes.filter(entry => entry.id !== id);
    if (data.routes.length === originalLength) return sendJson(response, 404, { error: 'Route not found' });
    addNotification(data, 'A transport route was deleted.', 'route');
    writeData(data);
    return sendJson(response, 200, { success: true });
  }
  return sendJson(response, 405, { error: 'Method not supported' });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      return response.end();
    }
    if (requestUrl.pathname.startsWith('/api/')) return await handleApi(request, response, requestUrl);
    const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    const filePath = path.normalize(path.join(root, requestedPath));
    if (!filePath.startsWith(root)) return sendJson(response, 403, { error: 'Forbidden' });
    fs.readFile(filePath, (error, content) => {
      if (error) return sendJson(response, 404, { error: 'Page not found' });
      response.writeHead(200, { 'Content-Type': `${mimeTypes[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` });
      response.end(content);
    });
  } catch (error) {
    sendJson(response, error.message === 'Invalid JSON' ? 400 : 500, { error: error.message });
  }
});

server.listen(port, () => console.log(`HarvestLink running at http://localhost:${port}`));
