const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: 'kapal-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Global template variables
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

// Routes
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
app.use('/', userRoutes);
app.use('/admin', adminRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Halaman Tidak Ditemukan' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Terjadi Kesalahan', error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚢 Sistem Pemesanan Tiket Kapal berjalan di http://localhost:${PORT}`);
  console.log(`   Admin: admin@kapal.com / admin123`);
  console.log(`   User:  budi@example.com / user123`);
});
