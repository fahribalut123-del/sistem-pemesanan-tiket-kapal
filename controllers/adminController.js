const db = require('../database/db');
const QRCode = require('qrcode');

const money = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const today = () => new Date().toISOString().split('T')[0];

// ==================== DASHBOARD ====================
exports.dashboard = (req, res) => {
  const stats = {
    totalShips: db.prepare("SELECT COUNT(*) c FROM ships WHERE status='aktif'").get().c,
    totalRoutes: db.prepare("SELECT COUNT(*) c FROM routes WHERE status='aktif'").get().c,
    activeSchedules: db.prepare("SELECT COUNT(*) c FROM schedules WHERE status='terjadwal'").get().c,
    totalUsers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get().c,
    totalBookings: db.prepare('SELECT COUNT(*) c FROM bookings').get().c,
    todayBookings: db.prepare("SELECT COUNT(*) c FROM bookings WHERE date(created_at) = date('now')").get().c,
    totalRevenue: db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='dibayar'").get().s,
    pendingPayments: db.prepare("SELECT COUNT(*) c FROM payments WHERE status='menunggu_verifikasi'").get().c,
    totalPassengers: db.prepare('SELECT COUNT(*) c FROM passengers').get().c,
  };

  const recentBookings = db.prepare(`
    SELECT b.*, s.departure_date, s.departure_time,
           sh.name AS ship_name, po.name AS origin_name, pd.name AS destination_name,
           u.name AS user_name
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    JOIN users u ON u.id = b.user_id
    ORDER BY b.created_at DESC
    LIMIT 10
  `).all();

  // Chart data: bookings per day (last 7 days)
  const bookingsPerDay = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count, COALESCE(SUM(total_price),0) as revenue
    FROM bookings
    WHERE created_at >= date('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY day
  `).all();

  // Chart data: revenue per month (last 6 months)
  const revenuePerMonth = db.prepare(`
    SELECT strftime('%Y-%m', payment_date) as month, SUM(amount) as revenue
    FROM payments
    WHERE status = 'dibayar' AND payment_date >= date('now', '-6 months', 'start of month')
    GROUP BY month
    ORDER BY month
  `).all();

  res.render('admin/dashboard', { title: 'Dashboard Admin', stats, recentBookings, bookingsPerDay, revenuePerMonth, money });
};

// ==================== SHIPS CRUD ====================
exports.ships = (req, res) => {
  const ships = db.prepare('SELECT * FROM ships ORDER BY id DESC').all();
  res.render('admin/ships', { title: 'Kelola Kapal', ships, money, error: req.query.error, success: req.query.success });
};

exports.shipForm = (req, res) => {
  const ship = req.params.id ? db.prepare('SELECT * FROM ships WHERE id = ?').get(req.params.id) : null;
  res.render('admin/shipForm', { title: ship ? 'Edit Kapal' : 'Tambah Kapal', ship, error: null });
};

exports.saveShip = (req, res) => {
  const { name, number, type, capacity, description, facilities, status } = req.body;
  const shipId = req.query.id || req.body.id || null;
  if (!name || !type || !capacity) return res.render('admin/shipForm', { title: 'Kapal', ship: { ...req.body, id: shipId }, error: 'Nama, jenis, dan kapasitas wajib diisi.' });
  if (Number(capacity) <= 0) return res.render('admin/shipForm', { title: 'Kapal', ship: { ...req.body, id: shipId }, error: 'Kapasitas harus angka positif.' });

  if (shipId) {
    db.prepare('UPDATE ships SET name=?, number=?, type=?, capacity=?, description=?, facilities=?, status=? WHERE id=?')
      .run(name, number, type, capacity, description, facilities, status, shipId);
  } else {
    db.prepare('INSERT INTO ships (name, number, type, capacity, description, facilities, status) VALUES (?,?,?,?,?,?,?)')
      .run(name, number, type, capacity, description, facilities, status || 'aktif');
  }
  res.redirect('/admin/kapal?success=1');
};

exports.deleteShip = (req, res) => {
  // Check if ship is used in schedules
  const used = db.prepare('SELECT COUNT(*) c FROM schedules WHERE ship_id = ?').get(req.params.id).c;
  if (used > 0) {
    // Deactivate instead
    db.prepare("UPDATE ships SET status='nonaktif' WHERE id=?").run(req.params.id);
    return res.redirect('/admin/kapal?error=Ship digunakan dalam jadwal, status dinonaktifkan.');
  }
  db.prepare('DELETE FROM ships WHERE id=?').run(req.params.id);
  res.redirect('/admin/kapal?success=1');
};

// ==================== PORTS CRUD ====================
exports.ports = (req, res) => {
  const ports = db.prepare('SELECT * FROM ports ORDER BY id DESC').all();
  res.render('admin/ports', { title: 'Kelola Pelabuhan', ports, error: req.query.error, success: req.query.success });
};

exports.portForm = (req, res) => {
  const port = req.params.id ? db.prepare('SELECT * FROM ports WHERE id = ?').get(req.params.id) : null;
  res.render('admin/portForm', { title: port ? 'Edit Pelabuhan' : 'Tambah Pelabuhan', port, error: null });
};

exports.savePort = (req, res) => {
  const { name, city, province, address, status } = req.body;
  const portId = req.query.id || req.body.id || null;
  if (!name || !city || !province) return res.render('admin/portForm', { title: 'Pelabuhan', port: { ...req.body, id: portId }, error: 'Nama, kota, dan provinsi wajib diisi.' });
  if (portId) {
    db.prepare('UPDATE ports SET name=?, city=?, province=?, address=?, status=? WHERE id=?')
      .run(name, city, province, address, status, portId);
  } else {
    db.prepare('INSERT INTO ports (name, city, province, address, status) VALUES (?,?,?,?,?)')
      .run(name, city, province, address, status || 'aktif');
  }
  res.redirect('/admin/pelabuhan?success=1');
};

exports.deletePort = (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM routes WHERE origin_port_id = ? OR destination_port_id = ?').get(req.params.id, req.params.id).c;
  if (used > 0) {
    db.prepare("UPDATE ports SET status='nonaktif' WHERE id=?").run(req.params.id);
    return res.redirect('/admin/pelabuhan?error=Pelabuhan digunakan dalam rute, status dinonaktifkan.');
  }
  db.prepare('DELETE FROM ports WHERE id=?').run(req.params.id);
  res.redirect('/admin/pelabuhan?success=1');
};

// ==================== ROUTES CRUD ====================
exports.routes = (req, res) => {
  const routes = db.prepare(`
    SELECT r.*, po.name AS origin_name, pd.name AS destination_name
    FROM routes r
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    ORDER BY r.id DESC
  `).all();
  res.render('admin/routes', { title: 'Kelola Rute', routes, error: req.query.error, success: req.query.success });
};

exports.routeForm = (req, res) => {
  const ports = db.prepare("SELECT * FROM ports WHERE status='aktif' ORDER BY name").all();
  const route = req.params.id ? db.prepare('SELECT * FROM routes WHERE id = ?').get(req.params.id) : null;
  res.render('admin/routeForm', { title: route ? 'Edit Rute' : 'Tambah Rute', route, ports, error: null });
};

exports.saveRoute = (req, res) => {
  const { origin_port_id, destination_port_id, duration, status } = req.body;
  const routeId = req.query.id || req.body.id || null;
  const ports = db.prepare("SELECT * FROM ports WHERE status='aktif' ORDER BY name").all();
  if (!origin_port_id || !destination_port_id || !duration) {
    return res.render('admin/routeForm', { title: 'Rute', route: { ...req.body, id: routeId }, ports, error: 'Semua field wajib diisi.' });
  }
  if (origin_port_id === destination_port_id) {
    return res.render('admin/routeForm', { title: 'Rute', route: { ...req.body, id: routeId }, ports, error: 'Pelabuhan asal dan tujuan tidak boleh sama.' });
  }
  if (routeId) {
    db.prepare('UPDATE routes SET origin_port_id=?, destination_port_id=?, duration=?, status=? WHERE id=?')
      .run(origin_port_id, destination_port_id, duration, status, routeId);
  } else {
    db.prepare('INSERT INTO routes (origin_port_id, destination_port_id, duration, status) VALUES (?,?,?,?)')
      .run(origin_port_id, destination_port_id, duration, status || 'aktif');
  }
  res.redirect('/admin/rute?success=1');
};

exports.deleteRoute = (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM schedules WHERE route_id = ?').get(req.params.id).c;
  if (used > 0) {
    db.prepare("UPDATE routes SET status='nonaktif' WHERE id=?").run(req.params.id);
    return res.redirect('/admin/rute?error=Rute digunakan dalam jadwal, status dinonaktifkan.');
  }
  db.prepare('DELETE FROM routes WHERE id=?').run(req.params.id);
  res.redirect('/admin/rute?success=1');
};

// ==================== SCHEDULES CRUD ====================
exports.schedules = (req, res) => {
  const schedules = db.prepare(`
    SELECT s.*, sh.name AS ship_name, po.name AS origin_name, pd.name AS destination_name
    FROM schedules s
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    ORDER BY s.departure_date DESC, s.departure_time DESC
  `).all();
  res.render('admin/schedules', { title: 'Kelola Jadwal', schedules, money, error: req.query.error, success: req.query.success, today: today() });
};

exports.scheduleForm = (req, res) => {
  const ships = db.prepare("SELECT * FROM ships WHERE status='aktif' ORDER BY name").all();
  const routes = db.prepare(`
    SELECT r.*, po.name AS origin_name, pd.name AS destination_name
    FROM routes r
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE r.status='aktif'
  `).all();
  const schedule = req.params.id ? db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id) : null;
  res.render('admin/scheduleForm', { title: schedule ? 'Edit Jadwal' : 'Tambah Jadwal', schedule, ships, routes, error: null, today: today() });
};

exports.saveSchedule = (req, res) => {
  const { ship_id, route_id, departure_date, departure_time, arrival_time, price, capacity, status } = req.body;
  const scheduleId = req.query.id || req.body.id || null;
  const ships = db.prepare("SELECT * FROM ships WHERE status='aktif' ORDER BY name").all();
  const routes = db.prepare(`
    SELECT r.*, po.name AS origin_name, pd.name AS destination_name
    FROM routes r JOIN ports po ON po.id = r.origin_port_id JOIN ports pd ON pd.id = r.destination_port_id
    WHERE r.status='aktif'
  `).all();
  const formData = { ...req.body, id: scheduleId };

  if (!ship_id || !route_id || !departure_date || !departure_time || !arrival_time || !price || !capacity) {
    return res.render('admin/scheduleForm', { title: 'Jadwal', schedule: formData, ships, routes, error: 'Semua field wajib diisi.', today: today() });
  }
  if (Number(price) <= 0) return res.render('admin/scheduleForm', { title: 'Jadwal', schedule: formData, ships, routes, error: 'Harga harus angka positif.', today: today() });
  if (Number(capacity) <= 0) return res.render('admin/scheduleForm', { title: 'Jadwal', schedule: formData, ships, routes, error: 'Kapasitas harus angka positif.', today: today() });

  // Check departure date not in past (for new schedules)
  if (!scheduleId && departure_date < today()) {
    return res.render('admin/scheduleForm', { title: 'Jadwal', schedule: formData, ships, routes, error: 'Tanggal keberangkatan tidak boleh di masa lalu.', today: today() });
  }

  // Get ship capacity
  const ship = db.prepare('SELECT capacity FROM ships WHERE id = ?').get(ship_id);
  if (ship && Number(capacity) > ship.capacity) {
    return res.render('admin/scheduleForm', { title: 'Jadwal', schedule: formData, ships, routes, error: `Kapasitas jadwal melebihi kapasitas kapal (${ship.capacity}).`, today: today() });
  }

  if (scheduleId) {
    const existing = db.prepare('SELECT available_seats, capacity FROM schedules WHERE id = ?').get(scheduleId);
    const sold = existing.capacity - existing.available_seats;
    const newAvail = Math.max(0, Number(capacity) - sold);
    db.prepare(`UPDATE schedules SET ship_id=?, route_id=?, departure_date=?, departure_time=?, arrival_time=?, price=?, capacity=?, available_seats=?, status=? WHERE id=?`)
      .run(ship_id, route_id, departure_date, departure_time, arrival_time, price, capacity, newAvail, status, scheduleId);
  } else {
    db.prepare(`INSERT INTO schedules (ship_id, route_id, departure_date, departure_time, arrival_time, price, capacity, available_seats, status) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(ship_id, route_id, departure_date, departure_time, arrival_time, price, capacity, capacity, status || 'terjadwal');
  }
  res.redirect('/admin/jadwal?success=1');
};

exports.deleteSchedule = (req, res) => {
  const hasBookings = db.prepare("SELECT COUNT(*) c FROM bookings WHERE schedule_id = ? AND booking_status NOT IN ('dibatalkan')").get(req.params.id).c;
  if (hasBookings > 0) {
    db.prepare("UPDATE schedules SET status='dibatalkan' WHERE id=?").run(req.params.id);
    return res.redirect('/admin/jadwal?error=Jadwal memiliki pesanan aktif, status diubah menjadi dibatalkan.');
  }
  // Return seats first if any bookings (cancelled ones)
  db.prepare('DELETE FROM schedules WHERE id=?').run(req.params.id);
  res.redirect('/admin/jadwal?success=1');
};

// ==================== BOOKINGS ====================
exports.bookings = (req, res) => {
  const filterStatus = req.query.status || '';
  let bookings;
  if (filterStatus) {
    bookings = db.prepare(`
      SELECT b.*, s.departure_date, s.departure_time,
             sh.name AS ship_name, po.name AS origin_name, pd.name AS destination_name,
             u.name AS user_name, u.email AS user_email
      FROM bookings b
      JOIN schedules s ON s.id = b.schedule_id
      JOIN ships sh ON sh.id = s.ship_id
      JOIN routes r ON r.id = s.route_id
      JOIN ports po ON po.id = r.origin_port_id
      JOIN ports pd ON pd.id = r.destination_port_id
      JOIN users u ON u.id = b.user_id
      WHERE b.booking_status = ?
      ORDER BY b.created_at DESC
    `).all(filterStatus);
  } else {
    bookings = db.prepare(`
      SELECT b.*, s.departure_date, s.departure_time,
             sh.name AS ship_name, po.name AS origin_name, pd.name AS destination_name,
             u.name AS user_name, u.email AS user_email
      FROM bookings b
      JOIN schedules s ON s.id = b.schedule_id
      JOIN ships sh ON sh.id = s.ship_id
      JOIN routes r ON r.id = s.route_id
      JOIN ports po ON po.id = r.origin_port_id
      JOIN ports pd ON pd.id = r.destination_port_id
      JOIN users u ON u.id = b.user_id
      ORDER BY b.created_at DESC
    `).all();
  }
  res.render('admin/bookings', { title: 'Pemesanan', bookings, filterStatus, money });
};

exports.bookingDetail = (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, s.departure_date, s.departure_time, s.arrival_time, s.price, s.available_seats, s.status AS schedule_status,
           sh.name AS ship_name, sh.type AS ship_type,
           po.name AS origin_name, pd.name AS destination_name,
           u.name AS user_name, u.email AS user_email, u.phone AS user_phone
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    JOIN users u ON u.id = b.user_id
    WHERE b.booking_code = ?
  `).get(req.params.bookingCode);
  if (!booking) return res.status(404).render('404', { title: 'Booking Tidak Ditemukan' });

  const passengers = db.prepare('SELECT * FROM passengers WHERE booking_id = ?').all(booking.id);
  const payment = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1').get(booking.id);
  const tickets = db.prepare(`
    SELECT t.*, p.name AS passenger_name FROM tickets t JOIN passengers p ON p.id = t.passenger_id WHERE t.booking_id = ?
  `).all(booking.id);
  res.render('admin/bookingDetail', { title: 'Detail Pemesanan', booking, passengers, payment, tickets, money, success: req.query.success, error: req.query.error });
};

exports.updateBookingStatus = (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_code = ?').get(req.params.bookingCode);
  if (!booking) return res.status(404).render('404', { title: 'Booking Tidak Ditemukan' });
  const { booking_status } = req.body;
  const valid = ['menunggu', 'dikonfirmasi', 'berangkat', 'selesai', 'dibatalkan'];
  if (!valid.includes(booking_status)) return res.redirect('/admin/pesanan/' + booking.booking_code);
  db.prepare('UPDATE bookings SET booking_status = ? WHERE id = ?').run(booking_status, booking.id);
  res.redirect('/admin/pesanan/' + booking.booking_code + '?success=Status pesanan diperbarui.');
};

exports.cancelAdminBooking = (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, s.status AS schedule_status FROM bookings b JOIN schedules s ON s.id = b.schedule_id WHERE b.booking_code = ?
  `).get(req.params.bookingCode);
  if (!booking) return res.status(404).render('404', { title: 'Booking Tidak Ditemukan' });
  if (booking.schedule_status === 'berangkat' || booking.schedule_status === 'selesai') {
    return res.redirect('/admin/pesanan/' + booking.booking_code + '?error=Kapal sudah berangkat, tidak dapat dibatalkan.');
  }
  if (booking.booking_status === 'dibatalkan') return res.redirect('/admin/pesanan/' + booking.booking_code);

  db.tx(() => {
    db.prepare("UPDATE bookings SET booking_status='dibatalkan', payment_status='dibatalkan' WHERE id=?").run(booking.id);
    if (booking.payment_status !== 'dibayar') {
      db.prepare('UPDATE schedules SET available_seats = available_seats + ? WHERE id = ?').run(booking.total_passengers, booking.schedule_id);
      db.prepare('INSERT INTO seat_logs (schedule_id, change_amount, reason) VALUES (?, ?, ?)').run(booking.schedule_id, booking.total_passengers, 'admin_cancel_' + booking.booking_code);
    }
    db.prepare("UPDATE payments SET status='dibatalkan' WHERE booking_id=?").run(booking.id);
    db.prepare("UPDATE tickets SET status='dibatalkan' WHERE booking_id=?").run(booking.id);
  });
  res.redirect('/admin/pesanan/' + booking.booking_code + '?success=Pesanan dibatalkan.');
};

// ==================== PAYMENTS ====================
exports.payments = (req, res) => {
  const filterStatus = req.query.status || '';
  let payments;
  if (filterStatus) {
    payments = db.prepare(`
      SELECT p.*, b.booking_code, b.total_passengers, b.booking_status,
             u.name AS user_name, u.email AS user_email
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      JOIN users u ON u.id = b.user_id
      WHERE p.status = ?
      ORDER BY p.id DESC
    `).all(filterStatus);
  } else {
    payments = db.prepare(`
      SELECT p.*, b.booking_code, b.total_passengers, b.booking_status,
             u.name AS user_name, u.email AS user_email
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      JOIN users u ON u.id = b.user_id
      ORDER BY p.id DESC
    `).all();
  }
  res.render('admin/payments', { title: 'Pembayaran', payments, filterStatus, money });
};

exports.verifyPayment = (req, res) => {
  const paymentId = req.params.id;
  const { action } = req.body;
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) return res.redirect('/admin/pembayaran');
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(payment.booking_id);
  if (!booking) return res.redirect('/admin/pembayaran');

  if (action === 'approve') {
    db.prepare("UPDATE payments SET status='dibayar', payment_date=? WHERE id=?")
      .run(new Date().toISOString().slice(0, 19).replace('T', ' '), paymentId);
    db.prepare("UPDATE bookings SET payment_status='dibayar', booking_status='dikonfirmasi' WHERE id=?").run(booking.id);
    // Generate tickets
    const passengers = db.prepare('SELECT * FROM passengers WHERE booking_id = ?').all(booking.id);
    const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(booking.schedule_id);
    const existingTickets = db.prepare('SELECT COUNT(*) c FROM tickets WHERE booking_id = ?').get(booking.id).c;
    if (existingTickets === 0) {
      let seatNum = 1;
      passengers.forEach(p => {
        const code = 'TK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
        db.prepare('INSERT INTO tickets (booking_id, passenger_id, ticket_code, seat_number, status) VALUES (?,?,?,?,?)')
          .run(booking.id, p.id, code, 'A' + seatNum, 'aktif');
        seatNum++;
      });
    }
  } else if (action === 'reject') {
    db.prepare("UPDATE payments SET status='ditolak' WHERE id=?").run(paymentId);
    db.prepare("UPDATE bookings SET payment_status='ditolak' WHERE id=?").run(booking.id);
    // Return seats
    db.prepare('UPDATE schedules SET available_seats = available_seats + ? WHERE id = ?').run(booking.total_passengers, booking.schedule_id);
    db.prepare('INSERT INTO seat_logs (schedule_id, change_amount, reason) VALUES (?, ?, ?)').run(booking.schedule_id, booking.total_passengers, 'reject_' + booking.booking_code);
  }
  res.redirect('/admin/pembayaran?success=1');
};

// ==================== REPORTS ====================
exports.reports = (req, res) => {
  const { start, end } = req.query;
  const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate = end || today();

  const bookings = db.prepare(`
    SELECT b.*, s.departure_date, s.departure_time,
           sh.name AS ship_name, po.name AS origin_name, pd.name AS destination_name,
           u.name AS user_name
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    JOIN users u ON u.id = b.user_id
    WHERE date(b.created_at) BETWEEN ? AND ?
    ORDER BY b.created_at DESC
  `).all(startDate, endDate);

  const summary = {
    totalBookings: bookings.length,
    totalPassengers: bookings.reduce((a, b) => a + b.total_passengers, 0),
    totalRevenue: db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='dibayar' AND date(payment_date) BETWEEN ? AND ?`).get(startDate, endDate).s,
    paidBookings: bookings.filter(b => b.payment_status === 'dibayar').length,
    cancelledBookings: bookings.filter(b => b.payment_status === 'dibatalkan').length,
  };

  const revenuePerDay = db.prepare(`
    SELECT date(payment_date) as day, SUM(amount) as revenue, COUNT(*) as count
    FROM payments WHERE status='dibayar' AND date(payment_date) BETWEEN ? AND ?
    GROUP BY day ORDER BY day
  `).all(startDate, endDate);

  const bookingsPerRoute = db.prepare(`
    SELECT po.name || ' → ' || pd.name AS route, COUNT(*) as count, SUM(b.total_price) as revenue
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE date(b.created_at) BETWEEN ? AND ?
    GROUP BY route ORDER BY count DESC
  `).all(startDate, endDate);

  res.render('admin/reports', { title: 'Laporan Transaksi', bookings, summary, revenuePerDay, bookingsPerRoute, startDate, endDate, money });
};

// ==================== PASSENGERS ====================
exports.passengers = (req, res) => {
  const passengers = db.prepare(`
    SELECT p.*, b.booking_code, b.booking_status, b.payment_status, s.departure_date
    FROM passengers p
    JOIN bookings b ON b.id = p.booking_id
    JOIN schedules s ON s.id = b.schedule_id
    ORDER BY p.id DESC
    LIMIT 200
  `).all();
  res.render('admin/passengers', { title: 'Data Penumpang', passengers, money });
};
