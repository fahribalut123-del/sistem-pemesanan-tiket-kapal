const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { isAdmin } = require('../middleware/auth');

// All admin routes require admin role
router.use(isAdmin);

// Dashboard
router.get('/dashboard', ctrl.dashboard);

// Ships
router.get('/kapal', ctrl.ships);
router.get('/kapal/tambah', ctrl.shipForm);
router.get('/kapal/:id/edit', ctrl.shipForm);
router.post('/kapal/simpan', ctrl.saveShip);
router.post('/kapal/:id/hapus', ctrl.deleteShip);

// Ports
router.get('/pelabuhan', ctrl.ports);
router.get('/pelabuhan/tambah', ctrl.portForm);
router.get('/pelabuhan/:id/edit', ctrl.portForm);
router.post('/pelabuhan/simpan', ctrl.savePort);
router.post('/pelabuhan/:id/hapus', ctrl.deletePort);

// Routes
router.get('/rute', ctrl.routes);
router.get('/rute/tambah', ctrl.routeForm);
router.get('/rute/:id/edit', ctrl.routeForm);
router.post('/rute/simpan', ctrl.saveRoute);
router.post('/rute/:id/hapus', ctrl.deleteRoute);

// Schedules
router.get('/jadwal', ctrl.schedules);
router.get('/jadwal/tambah', ctrl.scheduleForm);
router.get('/jadwal/:id/edit', ctrl.scheduleForm);
router.post('/jadwal/simpan', ctrl.saveSchedule);
router.post('/jadwal/:id/hapus', ctrl.deleteSchedule);

// Bookings
router.get('/pesanan', ctrl.bookings);
router.get('/pesanan/:bookingCode', ctrl.bookingDetail);
router.post('/pesanan/:bookingCode/status', ctrl.updateBookingStatus);
router.post('/pesanan/:bookingCode/batal', ctrl.cancelAdminBooking);

// Payments
router.get('/pembayaran', ctrl.payments);
router.post('/pembayaran/:id/verifikasi', ctrl.verifyPayment);

// Reports
router.get('/laporan', ctrl.reports);

// Passengers
router.get('/penumpang', ctrl.passengers);

module.exports = router;
