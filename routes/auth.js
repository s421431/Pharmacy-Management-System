// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

// Shared in-memory users store (replace with MySQL table later)
// Note: 'admin123' below is pre-hashed at server startup via the IIFE further down
const users = [
  { id: 'u1', name: 'Dr. Rajesh Sharma', email: 'admin@pharmacy.com', password: null, role: 'admin' }
];

// Hash the seed admin's password once at startup (since bcrypt.hash is async)
(async () => {
  users[0].password = await bcrypt.hash('admin123', 10);
})();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).render('login', { error: 'Invalid email or password.' });
  }

  req.session.user = { id: user.id, name: user.name, role: user.role };
  res.redirect('/dashboard');
});

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).render('register', { error: 'All fields are required.' });
  }

  if (users.find(u => u.email === email)) {
    return res.status(400).render('register', { error: 'An account with that email already exists.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  users.push({
    id: 'u' + Date.now(),
    name: name.trim(),
    email: email.trim(),
    password: hashedPassword,
    role: role // 'admin' or 'pharmacist', from the dropdown
  });

  res.redirect('/login?registered=true');
});

router.get('/logout', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('auth/logout-confirm');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;