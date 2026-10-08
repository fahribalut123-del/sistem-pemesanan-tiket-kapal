const db = require('./database/db');
const bcrypt = require('bcryptjs');

// Clear existing data (in reverse order of dependencies)
db.exec('DELETE FROM tickets');
db.exec('DELETE FROM payments');
db.exec('DELETE FROM passengers');
db.exec('DELETE FROM bookings');
db.exec('DELETE FROM seat_logs');
db.exec('DELETE FROM schedules');
db.exec('DELETE FROM routes');
db.exec('DELETE FROM ships');
db.exec('DELETE FROM ports');
db.exec('DELETE FROM users');

// Reset auto-increment counters
['tickets','payments','passengers','bookings','seat_logs','schedules','routes','ships','ports','users'].forEach(t => {
  db.exec(`DELETE FROM sqlite_sequence WHERE name='${t}'`);
});

// ========== USERS ==========
const hash = (p) => bcrypt.hashSync(p, 10);

const insertUser = db.prepare(`
  INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)
`);

const adminId = insertUser.run('Admin Kapal', 'admin@kapal.com', hash('admin123'), 'admin', '081111111111', '2025-01-01 08:00:00').lastInsertRowid;
const userId1 = insertUser.run('Budi Santoso', 'budi@example.com', hash('user123'), 'user', '082222222222', '2025-02-01 10:00:00').lastInsertRowid;
const userId2 = insertUser.run('Siti Rahayu', 'siti@example.com', hash('user123'), 'user', '083333333333', '2025-02-10 14:00:00').lastInsertRowid;

// ========== PORTS ==========
const insertPort = db.prepare(`INSERT INTO ports (name, city, province, address, status) VALUES (?, ?, ?, ?, ?)`);

const manado = insertPort.run('Pelabuhan Manado', 'Manado', 'Sulawesi Utara', 'Jalan Sam Ratulangi, Manado', 'aktif').lastInsertRowid;
const bitung = insertPort.run('Pelabuhan Bitung', 'Bitung', 'Sulawesi Utara', 'Jalan Sam Ratulangi, Bitung', 'aktif').lastInsertRowid;
const tahuna = insertPort.run('Pelabuhan Tahuna', 'Tahuna', 'Sulawesi Utara', 'Jalan Ahmad Yani, Tahuna', 'aktif').lastInsertRowid;
const ternate = insertPort.run('Pelabuhan Ternate', 'Ternate', 'Maluku Utara', 'Jalan Pelabuhan, Ternate', 'aktif').lastInsertRowid;
const melonguane = insertPort.run('Pelabuhan Melonguane', 'Melonguane', 'Sulawesi Utara', 'Jalan Raya Melonguane', 'aktif').lastInsertRowid;

// ========== SHIPS ==========
const insertShip = db.prepare(`
  INSERT INTO ships (name, number, type, capacity, description, facilities, image, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const ship1 = insertShip.run('KM Bahari Nusantara', 'BN-001', 'Kapal Penumpang', 200,
  'Kapal penumpang besar yang melayani rute-rute utama di Sulawesi Utara dengan kenyamanan tinggi.',
  'AC, Kantin, Musholla, Life Jacket, Ruang VIP', '/images/ship-bahari.jpg', 'aktif').lastInsertRowid;

const ship2 = insertShip.run('KM Samudra', 'SM-002', 'Kapal Ferry', 150,
  'Kapal ferry yang menghubungkan berbagai pulau di Sulawesi Utara dan Maluku Utara.',
  'AC, Kantin, Musholla, Life Jacket, Area Merokok', '/images/ship-samudra.jpg', 'aktif').lastInsertRowid;

const ship3 = insertShip.run('KM Nusa Jaya', 'NJ-003', 'Kapal Cepat', 80,
  'Kapal cepat dengan perjalanan lebih singkat untuk rute-rute pendek.',
  'AC, Life Jacket, Toilet, Sound System', '/images/ship-nusajaya.jpg', 'aktif').lastInsertRowid;

const ship4 = insertShip.run('KM Ternate Express', 'TE-004', 'Kapal Cepat', 120,
  'Kapal cepat premium yang melayani rute Manado - Ternate dengan kenyamanan terbaik.',
  'AC, VIP Lounge, Kantin, Musholla, Life Jacket', '/images/ship-ternate.jpg', 'aktif').lastInsertRowid;

// ========== ROUTES ==========
const insertRoute = db.prepare(`INSERT INTO routes (origin_port_id, destination_port_id, duration, status) VALUES (?, ?, ?, ?)`);

const route1 = insertRoute.run(manado, tahuna, '4 jam', 'aktif').lastInsertRowid;      // Manado -> Tahuna
const route2 = insertRoute.run(tahuna, manado, '4 jam', 'aktif').lastInsertRowid;      // Tahuna -> Manado
const route3 = insertRoute.run(bitung, ternate, '8 jam', 'aktif').lastInsertRowid;     // Bitung -> Ternate
const route4 = insertRoute.run(ternate, bitung, '8 jam', 'aktif').lastInsertRowid;     // Ternate -> Bitung
const route5 = insertRoute.run(manado, melonguane, '3 jam', 'aktif').lastInsertRowid;  // Manado -> Melonguane
const route6 = insertRoute.run(melonguane, manado, '3 jam', 'aktif').lastInsertRowid;  // Melonguane -> Manado
const route7 = insertRoute.run(manado, ternate, '12 jam', 'aktif').lastInsertRowid;    // Manado -> Ternate
const route8 = insertRoute.run(ternate, manado, '12 jam', 'aktif').lastInsertRowid;    // Ternate -> Manado

// ========== SCHEDULES ==========
const insertSchedule = db.prepare(`
  INSERT INTO schedules (ship_id, route_id, departure_date, departure_time, arrival_time, price, capacity, available_seats, status) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Helper to generate dates relative to today
const today = new Date();
const addDays = (d) => {
  const date = new Date(today);
  date.setDate(date.getDate() + d);
  return date.toISOString().split('T')[0];
};

const schedules = [
  // Manado -> Tahuna
  [ship1, route1, addDays(0),  '08:00', '12:00', 150000, 200, 150, 'terjadwal'],
  [ship2, route1, addDays(0),  '14:00', '18:00', 120000, 150, 80,  'terjadwal'],
  [ship1, route1, addDays(1),  '08:00', '12:00', 150000, 200, 200, 'terjadwal'],
  [ship2, route1, addDays(2),  '14:00', '18:00', 120000, 150, 130, 'terjadwal'],
  [ship1, route1, addDays(3),  '08:00', '12:00', 150000, 200, 190, 'terjadwal'],
  // Tahuna -> Manado
  [ship1, route2, addDays(1),  '10:00', '14:00', 150000, 200, 180, 'terjadwal'],
  [ship2, route2, addDays(2),  '14:00', '18:00', 120000, 150, 140, 'terjadwal'],
  // Bitung -> Ternate
  [ship2, route3, addDays(0),  '06:00', '14:00', 200000, 150, 100, 'terjadwal'],
  [ship4, route3, addDays(1),  '09:00', '17:00', 250000, 120, 90,  'terjadwal'],
  [ship2, route3, addDays(2),  '06:00', '14:00', 200000, 150, 120, 'terjadwal'],
  [ship4, route3, addDays(3),  '09:00', '17:00', 250000, 120, 100, 'terjadwal'],
  // Ternate -> Bitung
  [ship2, route4, addDays(1),  '08:00', '16:00', 200000, 150, 110, 'terjadwal'],
  [ship4, route4, addDays(2),  '10:00', '18:00', 250000, 120, 85,  'terjadwal'],
  // Manado -> Melonguane
  [ship3, route5, addDays(0),  '10:00', '13:00', 100000, 80,  50,  'terjadwal'],
  [ship3, route5, addDays(1),  '10:00', '13:00', 100000, 80,  70,  'terjadwal'],
  [ship3, route5, addDays(2),  '10:00', '13:00', 100000, 80,  75,  'terjadwal'],
  // Melonguane -> Manado
  [ship3, route6, addDays(1),  '08:00', '11:00', 100000, 80,  65,  'terjadwal'],
  [ship3, route6, addDays(2),  '08:00', '11:00', 100000, 80,  60,  'terjadwal'],
  // Manado -> Ternate
  [ship4, route7, addDays(1),  '07:00', '19:00', 350000, 120, 100, 'terjadwal'],
  [ship1, route7, addDays(2),  '09:00', '21:00', 300000, 200, 180, 'terjadwal'],
  // Ternate -> Manado
  [ship4, route8, addDays(2),  '08:00', '20:00', 350000, 120, 95,  'terjadwal'],
  [ship1, route8, addDays(3),  '10:00', '22:00', 300000, 200, 170, 'terjadwal'],
  // A schedule that's already departed (for testing)
  [ship2, route1, addDays(-1), '08:00', '12:00', 120000, 150, 0,  'selesai'],
  // A cancelled schedule
  [ship3, route5, addDays(2),  '14:00', '17:00', 100000, 80, 80, 'dibatalkan'],
];

const scheduleIds = schedules.map(s => insertSchedule.run(...s).lastInsertRowid);

// ========== BOOKINGS ==========
const insertBooking = db.prepare(`
  INSERT INTO bookings (booking_code, user_id, schedule_id, total_passengers, total_price, payment_status, booking_status, created_at) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertPassenger = db.prepare(`
  INSERT INTO passengers (booking_id, name, nik, gender, birth_date, phone) VALUES (?, ?, ?, ?, ?, ?)
`);

const insertPayment = db.prepare(`
  INSERT INTO payments (booking_id, payment_method, amount, payment_date, status, payment_reference) 
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertTicket = db.prepare(`
  INSERT INTO tickets (booking_id, passenger_id, ticket_code, seat_number, status) VALUES (?, ?, ?, ?, ?)
`);

const bookingCode = () => 'BK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
const ticketCode = () => 'TK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();

// Booking 1: User Budi, schedule 1 (Manado->Tahuna, 2 pax) - PAID, with tickets
const b1 = insertBooking.run(bookingCode(), userId1, scheduleIds[0], 2, 300000, 'dibayar', 'dikonfirmasi', '2025-09-01 10:00:00').lastInsertRowid;
db.prepare('UPDATE schedules SET available_seats = available_seats - 2 WHERE id = ?').run(scheduleIds[0]);
const p1a = insertPassenger.run(b1, 'Budi Santoso', '7101010101900001', 'Laki-laki', '1990-01-01', '082222222222').lastInsertRowid;
const p1b = insertPassenger.run(b1, 'Rina Santoso', '7101010202920002', 'Perempuan', '1992-02-02', '082222222223').lastInsertRowid;
insertPayment.run(b1, 'transfer_bank', 300000, '2025-09-01 10:30:00', 'dibayar', 'TRF-20250901-001');
insertTicket.run(b1, p1a, ticketCode(), 'A1', 'aktif');
insertTicket.run(b1, p1b, ticketCode(), 'A2', 'aktif');

// Booking 2: User Siti, schedule 7 (Bitung->Ternate, 1 pax) - PENDING VERIFICATION
const b2 = insertBooking.run(bookingCode(), userId2, scheduleIds[7], 1, 200000, 'menunggu_verifikasi', 'menunggu', '2025-09-05 14:00:00').lastInsertRowid;
db.prepare('UPDATE schedules SET available_seats = available_seats - 1 WHERE id = ?').run(scheduleIds[7]);
const p2 = insertPassenger.run(b2, 'Siti Rahayu', '7101010303930003', 'Perempuan', '1993-03-03', '083333333333').lastInsertRowid;
insertPayment.run(b2, 'ewallet', 200000, '2025-09-05 14:30:00', 'menunggu_verifikasi', 'EWL-20250905-002');

// Booking 3: User Budi, schedule 13 (Manado->Melonguane, 3 pax) - PENDING PAYMENT
const b3 = insertBooking.run(bookingCode(), userId1, scheduleIds[13], 3, 300000, 'menunggu_pembayaran', 'menunggu', new Date().toISOString().slice(0, 19).replace('T', ' ')).lastInsertRowid;
db.prepare('UPDATE schedules SET available_seats = available_seats - 3 WHERE id = ?').run(scheduleIds[13]);
insertPassenger.run(b3, 'Budi Santoso', '7101010101900001', 'Laki-laki', '1990-01-01', '082222222222');
insertPassenger.run(b3, 'Andi Wijaya', '7101010404850004', 'Laki-laki', '1985-04-04', '084444444444');
insertPassenger.run(b3, 'Maya Putri', '7101010505950005', 'Perempuan', '1995-05-05', '085555555555');
insertPayment.run(b3, 'virtual_account', 300000, null, 'menunggu_pembayaran', 'VA-880012345678');

// Booking 4: User Siti, schedule 4 (Manado->Tahuna, 1 pax) - REJECTED, seats returned
const b4 = insertBooking.run(bookingCode(), userId2, scheduleIds[3], 1, 120000, 'ditolak', 'dibatalkan', '2025-09-10 09:00:00').lastInsertRowid;
insertPassenger.run(b4, 'Siti Rahayu', '7101010303930003', 'Perempuan', '1993-03-03', '083333333333');
insertPayment.run(b4, 'transfer_bank', 120000, '2025-09-10 09:30:00', 'ditolak', 'TRF-20250910-004');

console.log('✅ Seed data berhasil dibuat!');
console.log('   Admin: admin@kapal.com / admin123');
console.log('   User:  budi@example.com / user123');
console.log('   User:  siti@example.com / user123');
console.log(`   Pelabuhan: ${manado}, ${bitung}, ${tahuna}, ${ternate}, ${melonguane}`);
console.log(`   Kapal: ${ship1}, ${ship2}, ${ship3}, ${ship4}`);
console.log(`   Rute: ${route1}-${route8}`);
console.log(`   Jadwal: ${scheduleIds.length} jadwal dibuat`);
console.log('   Booking: 4 booking dibuat');
