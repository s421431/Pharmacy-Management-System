const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/add', requireRole('admin'), (req, res) => {
  res.render('suppliers/add', { error: null });
});

router.post('/add', requireRole('admin'), async (req, res, next) => {
  const { name, phone, address, gst_number } = req.body;
  if (!name) return res.status(400).render('suppliers/add', { error: 'name is required' });
  try {
    await db.query(
      'INSERT INTO Supplier (name, phone, address, gst_number) VALUES (?, ?, ?, ?)',
      [name, phone || null, address || null, gst_number || null]
    );
    res.redirect('/purchase/add');
  } catch (err) {
    next(err);
  }
});

module.exports = router;