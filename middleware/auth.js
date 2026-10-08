// Auth middleware
exports.isLoggedIn = (req, res, next) => {
  if (req.session && req.session.user) return next();
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
};

exports.isAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).render('403', { title: 'Akses Ditolak' });
};

exports.isNotLoggedIn = (req, res, next) => {
  if (req.session && req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin/dashboard' : '/');
  }
  next();
};
