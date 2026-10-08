const db = require('../database/db');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

const money = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

// ==================== AUTH ====================
exports.showRegister = (req, res) => res.render('auth/register', { title: 'Registrasi', error: null, old: {} });

exports.register = (req, res) => {
  const { name, email, password, confirm_password, phone } = req.body;
  const old = { name, email, phone };
  if (!name || !email || !password) {
    return res.render('auth/register', { title: 'Registrasi', error: 'Semua field wajib diisi.', old });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.render('auth/register', { title: 'Registrasi', error: 'Format email tidak valid.', old });
  }
  if (password.length < 6) {
    return res.render('auth/register', { title: 'Registrasi', error: 'Password minimal 6 karakter.', old });
  }
  if (password !== confirm_password) {
    return res.render('auth/register', { title: 'Registrasi', error: 'Konfirmasi password tidak cocok.', old });
  }
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    return res.render('auth/register', { title: 'Registrasi', error: 'Email sudah terdaftar.', old });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, hash, 'user', phone || null);
  res.redirect('/login');
};

exports.showLogin = (req, res) => res.render('auth/login', { title: 'Login', error: null });

exports.login = (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('auth/login', { title: 'Login', error: 'Email dan password wajib diisi.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('auth/login', { title: 'Login', error: 'Email atau password salah.' });
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone };
  const redirectTo = req.session.returnTo || (user.role === 'admin' ? '/admin/dashboard' : '/');
  delete req.session.returnTo;
  return res.redirect(redirectTo);
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/'));
};

// ==================== HOME ====================
exports.home = (req, res) => {
  const ports = db.prepare("SELECT * FROM ports WHERE status='aktif' ORDER BY name").all();
  const popularSchedules = db.prepare(`
    SELECT s.*, sh.name AS ship_name, r.duration,
           po.name AS origin_name, pd.name AS destination_name,
           s.departure_date || ' ' || s.departure_time AS depart_at
    FROM schedules s
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE s.status = 'terjadwal' AND s.available_seats > 0 AND sh.status='aktif' AND r.status='aktif'
    ORDER BY s.departure_date, s.departure_time
    LIMIT 6
  `).all();
  const popularRoutes = db.prepare(`
    SELECT r.id, po.name AS origin_name, pd.name AS destination_name, r.duration,
           (SELECT COUNT(*) FROM schedules s WHERE s.route_id = r.id AND s.status='terjadwal') AS schedule_count
    FROM routes r
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE r.status = 'aktif'
    ORDER BY schedule_count DESC
    LIMIT 4
  `).all();
  res.render('user/home', { title: 'Beranda', ports, popularSchedules, popularRoutes, money });
};

// ==================== SEARCH ====================
exports.search = (req, res) => {
  const { asal, tujuan, tanggal, jumlah } = req.query;
  const ports = db.prepare("SELECT * FROM ports WHERE status='aktif' ORDER BY name").all();
  let results = [];
  let searchParams = { asal, tujuan, tanggal, jumlah: jumlah || '1' };
  let hasSearched = asal && tujuan && tanggal;

  if (hasSearched) {
    if (asal === tujuan) {
      res.locals.errorMessage = 'Pelabuhan asal dan tujuan tidak boleh sama.';
    } else {
      results = db.prepare(`
        SELECT s.*, sh.name AS ship_name, sh.type AS ship_type, sh.facilities, sh.image AS ship_image, sh.id AS ship_id,
               r.duration, po.name AS origin_name, pd.name AS destination_name,
               po.city AS origin_city, pd.city AS destination_city
        FROM schedules s
        JOIN ships sh ON sh.id = s.ship_id
        JOIN routes r ON r.id = s.route_id
        JOIN ports po ON po.id = r.origin_port_id
        JOIN ports pd ON pd.id = r.destination_port_id
        WHERE po.id = ? AND pd.id = ? AND s.departure_date = ?
          AND s.status = 'terjadwal' AND s.available_seats > 0
          AND sh.status = 'aktif' AND r.status = 'aktif'
          AND s.available_seats >= ?
        ORDER BY s.departure_time
      `).all(asal, tujuan, tanggal, Number(jumlah) || 1);
    }
  }
  res.render('user/search', { title: 'Cari Tiket', ports, results, searchParams, hasSearched, money });
};

// ==================== SHIP DETAIL ====================
exports.shipDetail = (req, res) => {
  const ship = db.prepare('SELECT * FROM ships WHERE id = ?').get(req.params.id);
  if (!ship) return res.status(404).render('404', { title: 'Kapal Tidak Ditemukan' });
  const upcoming = db.prepare(`
    SELECT s.*, po.name AS origin_name, pd.name AS destination_name
    FROM schedules s
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE s.ship_id = ? AND s.status = 'terjadwal' AND s.departure_date >= date('now')
    ORDER BY s.departure_date, s.departure_time
    LIMIT 10
  `).all(ship.id);
  res.render('user/shipDetail', { title: `Kapal ${ship.name}`, ship, upcoming, money });
};

// ==================== BOOKING ====================
exports.showBooking = (req, res) => {
  const schedule = db.prepare(`
    SELECT s.*, sh.name AS ship_name, sh.type AS ship_type,
           r.duration, po.name AS origin_name, pd.name AS destination_name,
           po.city AS origin_city, pd.city AS destination_city
    FROM schedules s
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE s.id = ?
  `).get(req.params.scheduleId);
  if (!schedule) return res.status(404).render('404', { title: 'Jadwal Tidak Ditemukan' });
  if (schedule.status !== 'terjadwal' || schedule.available_seats <= 0) {
    return res.render('user/booking', { title: 'Pemesanan', schedule: null, error: 'Jadwal ini tidak dapat dipesan.', money });
  }
  const maxPassengers = Math.min(schedule.available_seats, 5);
  res.render('user/booking', { title: 'Pemesanan Tiket', schedule, maxPassengers, error: null, money });
};

exports.createBooking = (req, res) => {
  const scheduleId = req.params.scheduleId;
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
  if (!schedule || schedule.status !== 'terjadwal') {
    return res.render('user/booking', { title: 'Pemesanan', schedule: null, error: 'Jadwal tidak tersedia.', money });
  }

  const numPassengers = parseInt(req.body.jumlah_penumpang) || 1;
  if (numPassengers < 1) {
    return res.render('user/booking', { title: 'Pemesanan', schedule, maxPassengers: 5, error: 'Jumlah penumpang minimal 1.', money });
  }
  if (numPassengers > schedule.available_seats) {
    return res.render('user/booking', { title: 'Pemesanan', schedule, maxPassengers: Math.min(schedule.available_seats, 5), error: `Jumlah penumpang melebihi kursi tersedia (${schedule.available_seats}).`, money });
  }

  // Collect passenger data
  const passengers = [];
  for (let i = 1; i <= numPassengers; i++) {
    const nama = req.body[`nama_${i}`]?.trim();
    const nik = req.body[`nik_${i}`]?.trim();
    const gender = req.body[`gender_${i}`];
    const lahir = req.body[`lahir_${i}`];
    const telp = req.body[`telp_${i}`]?.trim() || req.session.user.phone || '';

    if (!nama) return res.render('user/booking', { title: 'Pemesanan', schedule, maxPassengers: Math.min(schedule.available_seats, 5), error: `Nama penumpang ${i} wajib diisi.`, money });
    if (!nik || !/^\d{16}$/.test(nik)) return res.render('user/booking', { title: 'Pemesanan', schedule, maxPassengers: Math.min(schedule.available_seats, 5), error: `NIK penumpang ${i} harus 16 digit angka.`, money });
    if (!gender) return res.render('user/booking', { title: 'Pemesanan', schedule, maxPassengers: Math.min(schedule.available_seats, 5), error: `Jenis kelamin penumpang ${i} wajib dipilih.`, money });
    if (!lahir) return res.render('user/booking', { title: 'Pemesanan', schedule, maxPassengers: Math.min(schedule.available_seats, 5), error: `Tanggal lahir penumpang ${i} wajib diisi.`, money });

    passengers.push({ nama, nik, gender, lahir, telp });
  }

  // Calculate total
  const totalPrice = numPassengers * schedule.price;
  const bookingCode = 'BK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();

  // Transaction: create booking, reduce seats, create passengers, payment, tickets
  try {
    const result = db.tx(() => {
      // Re-check availability inside transaction
      const fresh = db.prepare('SELECT available_seats FROM schedules WHERE id = ?').get(scheduleId);
      if (fresh.available_seats < numPassengers) throw new Error('Kursi tidak mencukupi.');

      const bookingId = db.prepare(`
        INSERT INTO bookings (booking_code, user_id, schedule_id, total_passengers, total_price, payment_status, booking_status)
        VALUES (?, ?, ?, ?, ?, 'menunggu_pembayaran', 'menunggu')
      `).run(bookingCode, req.session.user.id, scheduleId, numPassengers, totalPrice).lastInsertRowid;

      db.prepare('UPDATE schedules SET available_seats = available_seats - ? WHERE id = ?').run(numPassengers, scheduleId);
      db.prepare('INSERT INTO seat_logs (schedule_id, change_amount, reason) VALUES (?, ?, ?)').run(scheduleId, -numPassengers, 'booking_' + bookingCode);

      const insertP = db.prepare('INSERT INTO passengers (booking_id, name, nik, gender, birth_date, phone) VALUES (?, ?, ?, ?, ?, ?)');
      const passengerIds = [];
      passengers.forEach(p => {
        passengerIds.push(insertP.run(bookingId, p.nama, p.nik, p.gender, p.lahir, p.telp).lastInsertRowid);
      });

      const method = req.body.payment_method || 'transfer_bank';
      const ref = (method === 'ewallet' ? 'EWL' : (method === 'virtual_account' ? 'VA' : 'TRF')) + '-' + Date.now();
      db.prepare('INSERT INTO payments (booking_id, payment_method, amount, status, payment_reference) VALUES (?, ?, ?, ?, ?)')
        .run(bookingId, method, totalPrice, 'menunggu_pembayaran', ref);

      return { bookingId, bookingCode };
    });
    return res.redirect('/checkout/' + result.bookingCode);
  } catch (err) {
    return res.render('user/booking', { title: 'Pemesanan', schedule, maxPassengers: Math.min(schedule.available_seats, 5), error: err.message, money });
  }
};

// ==================== CHECKOUT ====================
exports.showCheckout = (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, s.departure_date, s.departure_time, s.arrival_time, s.price, s.capacity, s.available_seats, s.status AS schedule_status,
           sh.name AS ship_name, sh.type AS ship_type,
           po.name AS origin_name, pd.name AS destination_name
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE b.booking_code = ? AND b.user_id = ?
  `).get(req.params.bookingCode, req.session.user.id);
  if (!booking) return res.status(404).render('404', { title: 'Booking Tidak Ditemukan' });

  const passengers = db.prepare('SELECT * FROM passengers WHERE booking_id = ?').all(booking.id);
  const payment = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1').get(booking.id);
  const methods = {
    transfer_bank: { name: 'Transfer Bank', va: '880012345678', bank: 'Bank BRI', desc: 'Transfer ke rekening Bank BRI' },
    ewallet: { name: 'E-Wallet', va: '081234567890', bank: 'GoPay / OVO / DANA', desc: 'Bayar melalui aplikasi e-wallet' },
    virtual_account: { name: 'Virtual Account', va: '880012345678', bank: 'Bank Mandiri', desc: 'Bayar melalui Virtual Account Bank Mandiri' }
  };
  const fee = 5000;
  const grandTotal = booking.total_price + fee;
  res.render('user/checkout', { title: 'Checkout', booking, passengers, payment, methods, fee, grandTotal, money });
};

// ==================== PAYMENT ====================
exports.showPayment = (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, s.departure_date, s.departure_time, s.arrival_time, s.price,
           sh.name AS ship_name,
           po.name AS origin_name, pd.name AS destination_name
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE b.booking_code = ? AND b.user_id = ?
  `).get(req.params.bookingCode, req.session.user.id);
  if (!booking) return res.status(404).render('404', { title: 'Booking Tidak Ditemukan' });

  const payment = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1').get(booking.id);
  const methods = {
    transfer_bank: { name: 'Transfer Bank', va: '880012345678', bank: 'Bank BRI', desc: 'Transfer ke rekening Bank BRI' },
    ewallet: { name: 'E-Wallet', va: '081234567890', bank: 'GoPay / OVO / DANA', desc: 'Bayar melalui aplikasi e-wallet' },
    virtual_account: { name: 'Virtual Account', va: '880012345678', bank: 'Bank Mandiri', desc: 'Bayar melalui Virtual Account Bank Mandiri' }
  };
  const fee = 5000;
  res.render('user/payment', { title: 'Pembayaran', booking, payment, methods, fee, money });
};

exports.processPayment = (req, res) => {
  const bookingCode = req.params.bookingCode;
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_code = ? AND user_id = ?').get(bookingCode, req.session.user.id);
  if (!booking) return res.status(404).render('404', { title: 'Booking Tidak Ditemukan' });
  if (booking.payment_status === 'dibayar') return res.redirect('/tiket');

  const method = req.body.payment_method;
  const validMethods = ['transfer_bank', 'ewallet', 'virtual_account'];
  if (!validMethods.includes(method)) {
    return res.render('user/payment', { title: 'Pembayaran', booking, payment: null, methods: {}, fee: 5000, money, error: 'Metode pembayaran tidak valid.' });
  }

  const fee = 5000;
  const total = booking.total_price + fee;
  const ref = (method === 'ewallet' ? 'EWL' : method === 'virtual_account' ? 'VA' : 'TRF') + '-' + Date.now();

  // Update or create payment record
  const existingPayment = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1').get(booking.id);
  if (existingPayment) {
    db.prepare('UPDATE payments SET payment_method = ?, amount = ?, status = ?, payment_reference = ? WHERE id = ?')
      .run(method, total, 'menunggu_verifikasi', ref, existingPayment.id);
  } else {
    db.prepare('INSERT INTO payments (booking_id, payment_method, amount, status, payment_reference) VALUES (?, ?, ?, ?, ?)')
      .run(booking.id, method, total, 'menunggu_verifikasi', ref);
  }

  db.prepare('UPDATE bookings SET payment_status = ? WHERE id = ?').run('menunggu_verifikasi', booking.id);
  res.redirect('/pembayaran/' + bookingCode + '?status=submitted');
};

exports.confirmPayment = (req, res) => {
  const bookingCode = req.params.bookingCode;
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_code = ? AND user_id = ?').get(bookingCode, req.session.user.id);
  if (!booking) return res.status(404).render('404', { title: 'Booking Tidak Ditemukan' });

  const existingPayment = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1').get(booking.id);
  if (!existingPayment) return res.redirect('/pembayaran/' + bookingCode);

  db.prepare('UPDATE payments SET status = ?, payment_date = ? WHERE id = ?')
    .run('menunggu_verifikasi', new Date().toISOString().slice(0, 19).replace('T', ' '), existingPayment.id);
  db.prepare('UPDATE bookings SET payment_status = ? WHERE id = ?').run('menunggu_verifikasi', booking.id);

  res.redirect('/pembayaran/' + bookingCode + '?submitted=1');
};

// ==================== BOOKING HISTORY ====================
exports.bookingHistory = (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, s.departure_date, s.departure_time, s.status AS schedule_status,
           sh.name AS ship_name,
           po.name AS origin_name, pd.name AS destination_name
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.session.user.id);
  res.render('user/bookingHistory', { title: 'Pesanan Saya', bookings, money });
};

exports.bookingDetail = (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, s.departure_date, s.departure_time, s.arrival_time, s.price, s.available_seats, s.status AS schedule_status,
           sh.name AS ship_name, sh.type AS ship_type,
           po.name AS origin_name, pd.name AS destination_name
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE b.booking_code = ? AND b.user_id = ?
  `).get(req.params.bookingCode, req.session.user.id);
  if (!booking) return res.status(404).render('404', { title: 'Booking Tidak Ditemukan' });

  const passengers = db.prepare('SELECT * FROM passengers WHERE booking_id = ?').all(booking.id);
  const payment = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1').get(booking.id);
  const tickets = db.prepare('SELECT * FROM tickets WHERE booking_id = ?').all(booking.id);
  const fee = 5000;
  res.render('user/bookingDetail', { title: 'Detail Pesanan', booking, passengers, payment, tickets, fee, money });
};

exports.cancelBooking = (req, res) => {
  const bookingCode = req.params.bookingCode;
  const booking = db.prepare(`
    SELECT b.*, s.status AS schedule_status, s.departure_date, s.departure_time, s.available_seats
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    WHERE b.booking_code = ? AND b.user_id = ?
  `).get(bookingCode, req.session.user.id);
  if (!booking) return res.status(404).render('404', { title: 'Booking Tidak Ditemukan' });

  // Check if cancellable
  if (booking.payment_status === 'dibayar' || booking.payment_status === 'dibatalkan' || booking.booking_status === 'dibatalkan') {
    return res.redirect('/pesanan/' + bookingCode + '?error=cannot_cancel');
  }
  if (booking.schedule_status === 'berangkat' || booking.schedule_status === 'selesai') {
    return res.redirect('/pesanan/' + bookingCode + '?error=departed');
  }

  db.tx(() => {
    db.prepare('UPDATE bookings SET booking_status = ?, payment_status = ? WHERE id = ?')
      .run('dibatalkan', 'dibatalkan', booking.id);
    db.prepare('UPDATE schedules SET available_seats = available_seats + ? WHERE id = ?')
      .run(booking.total_passengers, booking.schedule_id);
    db.prepare('INSERT INTO seat_logs (schedule_id, change_amount, reason) VALUES (?, ?, ?)')
      .run(booking.schedule_id, booking.total_passengers, 'cancel_' + bookingCode);
    db.prepare('UPDATE payments SET status = ? WHERE booking_id = ?').run('dibatalkan', booking.id);
    db.prepare('UPDATE tickets SET status = ? WHERE booking_id = ?').run('dibatalkan', booking.id);
  });
  res.redirect('/pesanan/' + bookingCode + '?cancelled=1');
};

// ==================== TICKETS ====================
exports.myTickets = (req, res) => {
  const tickets = db.prepare(`
    SELECT t.*, p.name AS passenger_name, p.nik,
           b.booking_code, b.booking_status, b.payment_status,
           s.departure_date, s.departure_time, s.arrival_time, s.status AS schedule_status,
           sh.name AS ship_name,
           po.name AS origin_name, pd.name AS destination_name
    FROM tickets t
    JOIN passengers p ON p.id = t.passenger_id
    JOIN bookings b ON b.id = t.booking_id
    JOIN schedules s ON s.id = b.schedule_id
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE b.user_id = ? AND t.status = 'aktif' AND b.payment_status = 'dibayar'
    ORDER BY s.departure_date DESC
  `).all(req.session.user.id);
  res.render('user/tickets', { title: 'Tiket Saya', tickets, money });
};

exports.ticketDetail = async (req, res) => {
  const ticket = db.prepare(`
    SELECT t.*, p.name AS passenger_name, p.nik,
           b.booking_code, b.booking_status, b.payment_status,
           s.departure_date, s.departure_time, s.arrival_time, s.status AS schedule_status, s.price,
           sh.name AS ship_name, sh.type AS ship_type,
           po.name AS origin_name, pd.name AS destination_name, po.city AS origin_city, pd.city AS destination_city
    FROM tickets t
    JOIN passengers p ON p.id = t.passenger_id
    JOIN bookings b ON b.id = t.booking_id
    JOIN schedules s ON s.id = b.schedule_id
    JOIN ships sh ON sh.id = s.ship_id
    JOIN routes r ON r.id = s.route_id
    JOIN ports po ON po.id = r.origin_port_id
    JOIN ports pd ON pd.id = r.destination_port_id
    WHERE t.ticket_code = ? AND b.user_id = ?
  `).get(req.params.ticketCode, req.session.user.id);
  if (!ticket) return res.status(404).render('404', { title: 'Tiket Tidak Ditemukan' });

  const qrDataUrl = await QRCode.toDataURL(ticket.ticket_code, { width: 200 });
  res.render('user/ticketDetail', { title: 'Detail Tiket', ticket, qrDataUrl, money });
};

// ==================== PROFILE ====================
exports.profile = (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const stats = {
    totalBookings: db.prepare('SELECT COUNT(*) c FROM bookings WHERE user_id = ?').get(user.id).c,
    activeTickets: db.prepare("SELECT COUNT(*) c FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE b.user_id=? AND t.status='aktif'").get(user.id).c
  };
  res.render('user/profile', { title: 'Profil', profile: user, stats, error: null, success: null, money });
};

exports.updateProfile = (req, res) => {
  const { name, phone } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const stats = {
    totalBookings: db.prepare('SELECT COUNT(*) c FROM bookings WHERE user_id = ?').get(user.id).c,
    activeTickets: db.prepare("SELECT COUNT(*) c FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE b.user_id=? AND t.status='aktif'").get(user.id).c
  };
  if (!name) return res.render('user/profile', { title: 'Profil', profile: user, stats, error: 'Nama wajib diisi.', success: null, money });
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone || null, req.session.user.id);
  req.session.user.name = name;
  req.session.user.phone = phone || null;
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  res.render('user/profile', { title: 'Profil', profile: updated, stats, error: null, success: 'Profil berhasil diperbarui.', money });
};
