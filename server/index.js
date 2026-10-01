const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const dbLib = require('./db');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function slugify(name) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let slug = base || 'business';
  let n = 1;
  while (dbLib.getBusinessBySlug(slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

function getAuthBusiness(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return dbLib.getBusinessByToken(token);
}

function serveStatic(req, res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendHtml(res, 403, 'Forbidden');
    return true;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function widgetPage(business, services) {
  const serviceOptions = services
    .map((s) => `<option value="${s.id}">${s.name}${s.price_cents ? ` — $${(s.price_cents / 100).toFixed(0)}` : ''}</option>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Book with ${business.name}</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div class="widget-wrap">
  <h1>${business.name}</h1>
  <p class="sub">Pick a service and time — book anytime, day or night.</p>
  <form id="booking-form">
    <input type="hidden" id="slug" value="${business.slug}">
    <label>Service
      <select id="service_id" required>${serviceOptions}</select>
    </label>
    <label>Your name
      <input type="text" id="customer_name" required>
    </label>
    <label>Phone
      <input type="tel" id="customer_phone" required>
    </label>
    <label>Email (optional)
      <input type="email" id="customer_email">
    </label>
    <label>Preferred date & time
      <input type="datetime-local" id="slot_start" required>
    </label>
    <button type="submit">Book appointment</button>
  </form>
  <div id="confirmation" class="hidden">
    <h2>You're booked ✓</h2>
    <p>${business.name} will confirm with you shortly.</p>
  </div>
  <p class="powered">Powered by Never Miss</p>
</div>
<script src="/widget.js"></script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  try {
    // ---- API routes ----
    if (pathname === '/api/signup' && req.method === 'POST') {
      const { businessName, ownerEmail, password } = await readBody(req);
      if (!businessName || !ownerEmail || !password) {
        return sendJson(res, 400, { error: 'businessName, ownerEmail, password are required' });
      }
      const slug = slugify(businessName);
      const business = dbLib.createBusiness({ slug, name: businessName, ownerEmail, password });
      dbLib.addService(business.id, { name: 'Standard visit', durationMinutes: 60, priceCents: null });
      dbLib.addService(business.id, { name: 'Emergency / after-hours call', durationMinutes: 60, priceCents: null });
      const session = dbLib.verifyLogin(ownerEmail, password);
      return sendJson(res, 200, { slug: business.slug, token: session.session_token, name: business.name });
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      const { ownerEmail, password } = await readBody(req);
      const session = dbLib.verifyLogin(ownerEmail, password);
      if (!session) return sendJson(res, 401, { error: 'Invalid email or password' });
      return sendJson(res, 200, { slug: session.slug, token: session.session_token, name: session.name });
    }

    if (pathname.startsWith('/api/business/') && req.method === 'GET') {
      const slug = pathname.split('/')[3];
      const business = dbLib.getBusinessBySlug(slug);
      if (!business) return sendJson(res, 404, { error: 'Not found' });
      const services = dbLib.getServices(business.id);
      return sendJson(res, 200, { name: business.name, slug: business.slug, services });
    }

    if (pathname === '/api/bookings' && req.method === 'POST') {
      const { slug, serviceId, customerName, customerPhone, customerEmail, slotStart } = await readBody(req);
      const business = dbLib.getBusinessBySlug(slug);
      if (!business) return sendJson(res, 404, { error: 'Business not found' });
      const booking = dbLib.createBooking({
        businessId: business.id, serviceId, customerName, customerPhone, customerEmail, slotStart,
      });
      return sendJson(res, 200, { ok: true, booking });
    }

    if (pathname === '/api/dashboard' && req.method === 'GET') {
      const business = getAuthBusiness(req);
      if (!business) return sendJson(res, 401, { error: 'Unauthorized' });
      const bookings = dbLib.getBookings(business.id);
      const afterHoursCount = bookings.filter((b) => b.is_after_hours).length;
      return sendJson(res, 200, {
        business: { name: business.name, slug: business.slug },
        bookings,
        stats: { total: bookings.length, afterHours: afterHoursCount },
      });
    }

    if (pathname === '/api/services' && req.method === 'POST') {
      const business = getAuthBusiness(req);
      if (!business) return sendJson(res, 401, { error: 'Unauthorized' });
      const { name, durationMinutes, priceCents } = await readBody(req);
      const service = dbLib.addService(business.id, { name, durationMinutes, priceCents });
      return sendJson(res, 200, { service });
    }

    // ---- Widget page (per business) ----
    if (pathname.startsWith('/b/') && req.method === 'GET') {
      const slug = pathname.split('/')[2];
      const business = dbLib.getBusinessBySlug(slug);
      if (!business) return sendHtml(res, 404, '<h1>Business not found</h1>');
      const services = dbLib.getServices(business.id);
      return sendHtml(res, 200, widgetPage(business, services));
    }

    // ---- Static files ----
    if (pathname === '/') {
      if (serveStatic(req, res, 'index.html')) return;
    }
    if (serveStatic(req, res, pathname)) return;

    sendHtml(res, 404, '<h1>404 — not found</h1>');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server error', detail: String(err && err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Never Miss server running on http://localhost:${PORT}`);
});
