const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'nevermiss.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    owner_email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    session_token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    price_cents INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    service_id INTEGER REFERENCES services(id),
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_email TEXT,
    slot_start TEXT NOT NULL,
    is_after_hours INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'requested',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createBusiness({ slug, name, ownerEmail, password }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const stmt = db.prepare(`
    INSERT INTO businesses (slug, name, owner_email, password_hash, salt)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(slug, name, ownerEmail, passwordHash, salt);
  return getBusinessById(result.lastInsertRowid);
}

function getBusinessBySlug(slug) {
  return db.prepare('SELECT * FROM businesses WHERE slug = ?').get(slug);
}

function getBusinessById(id) {
  return db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
}

function getBusinessByToken(token) {
  return db.prepare('SELECT * FROM businesses WHERE session_token = ?').get(token);
}

function verifyLogin(ownerEmail, password) {
  const biz = db.prepare('SELECT * FROM businesses WHERE owner_email = ?').get(ownerEmail);
  if (!biz) return null;
  const hash = hashPassword(password, biz.salt);
  if (hash !== biz.password_hash) return null;
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE businesses SET session_token = ? WHERE id = ?').run(token, biz.id);
  return { ...biz, session_token: token };
}

function addService(businessId, { name, durationMinutes, priceCents }) {
  const stmt = db.prepare(`
    INSERT INTO services (business_id, name, duration_minutes, price_cents)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(businessId, name, durationMinutes || 60, priceCents || null);
  return db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid);
}

function getServices(businessId) {
  return db.prepare('SELECT * FROM services WHERE business_id = ? ORDER BY id').all(businessId);
}

function createBooking({ businessId, serviceId, customerName, customerPhone, customerEmail, slotStart }) {
  const d = new Date(slotStart);
  const hour = d.getHours();
  const day = d.getDay(); // 0 = Sunday, 6 = Saturday
  const isAfterHours = hour < 8 || hour >= 18 || day === 0 || day === 6;
  const stmt = db.prepare(`
    INSERT INTO bookings (business_id, service_id, customer_name, customer_phone, customer_email, slot_start, is_after_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    businessId, serviceId || null, customerName, customerPhone || null,
    customerEmail || null, slotStart, isAfterHours ? 1 : 0
  );
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
}

function getBookings(businessId) {
  return db.prepare(`
    SELECT b.*, s.name AS service_name, s.price_cents AS service_price_cents
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.business_id = ?
    ORDER BY b.slot_start DESC
  `).all(businessId);
}

module.exports = {
  db,
  createBusiness,
  getBusinessBySlug,
  getBusinessById,
  getBusinessByToken,
  verifyLogin,
  addService,
  getServices,
  createBooking,
  getBookings,
};
