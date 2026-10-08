const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { isLoggedIn, isNotLoggedIn } = require('../middleware/auth');

// Auth
router.get('/register', isNotLoggedIn, ctrl.showRegister);
router.post('/register', isNotLoggedIn, ctrl.register);
router.get('/login', isNotLoggedIn, ctrl.showLogin);
router.post('/login', isNotLoggedIn, ctrl.login);
router.get('/logout', ctrl.logout);

// Home & Search
router.get('/', ctrl.home);
router.get('/cari', ctrl.search);
router.get('/kapal/:id', ctrl.shipDetail);

// Booking
router.get('/pesan/:scheduleId', isLoggedIn, ctrl.showBooking);
router.post('/pesan/:scheduleId', isLoggedIn, ctrl.createBooking);

// Checkout & Payment
router.get('/checkout/:bookingCode', isLoggedIn, ctrl.showCheckout);
router.get('/pembayaran/:bookingCode', isLoggedIn, ctrl.showPayment);
router.post('/pembayaran/:bookingCode', isLoggedIn, ctrl.processPayment);
router.post('/pembayaran/:bookingCode/konfirmasi', isLoggedIn, ctrl.confirmPayment);

// Bookings & Tickets
router.get('/pesanan', isLoggedIn, ctrl.bookingHistory);
router.get('/pesanan/:bookingCode', isLoggedIn, ctrl.bookingDetail);
router.get('/tiket', isLoggedIn, ctrl.myTickets);
router.get('/tiket/:ticketCode', isLoggedIn, ctrl.ticketDetail);
router.post('/pesanan/:bookingCode/batal', isLoggedIn, ctrl.cancelBooking);

// Profile
router.get('/profil', isLoggedIn, ctrl.profile);
router.post('/profil', isLoggedIn, ctrl.updateProfile);

module.exports = router;
