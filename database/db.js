const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'app.db'));

// Enable foreign keys and WAL mode
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Create all tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    province TEXT NOT NULL,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'aktif'
  );

  CREATE TABLE IF NOT EXISTS ships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    number TEXT,
    type TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK(capacity > 0),
    description TEXT,
    facilities TEXT,
    image TEXT,
    status TEXT NOT NULL DEFAULT 'aktif'
  );

  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin_port_id INTEGER NOT NULL REFERENCES ports(id),
    destination_port_id INTEGER NOT NULL REFERENCES ports(id),
    duration TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aktif',
    CHECK(origin_port_id != destination_port_id)
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ship_id INTEGER NOT NULL REFERENCES ships(id),
    route_id INTEGER NOT NULL REFERENCES routes(id),
    departure_date TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    arrival_time TEXT NOT NULL,
    price REAL NOT NULL CHECK(price > 0),
    capacity INTEGER NOT NULL CHECK(capacity > 0),
    available_seats INTEGER NOT NULL CHECK(available_seats >= 0),
    status TEXT NOT NULL DEFAULT 'terjadwal'
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_code TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    schedule_id INTEGER NOT NULL REFERENCES schedules(id),
    total_passengers INTEGER NOT NULL CHECK(total_passengers >= 1),
    total_price REAL NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'menunggu_pembayaran',
    booking_status TEXT NOT NULL DEFAULT 'menunggu',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS passengers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    nik TEXT NOT NULL,
    gender TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    phone TEXT
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    payment_method TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_date DATETIME,
    status TEXT NOT NULL DEFAULT 'menunggu_pembayaran',
    payment_reference TEXT
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    passenger_id INTEGER NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
    ticket_code TEXT UNIQUE NOT NULL,
    seat_number TEXT,
    status TEXT NOT NULL DEFAULT 'aktif'
  );

  CREATE TABLE IF NOT EXISTS seat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id),
    change_amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Transaction helper — wraps fn in BEGIN/COMMIT/ROLLBACK
db.tx = function(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

module.exports = db;
