const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /suppliers/add — form data (none needed, but kept for symmetry with other modules)
router.get('/add', requireRole('admin'), (req, res) => {
  res.json({ form: 'add-supplier' });
});

// POST /suppliers/add — quick supplier creation, usable inline from the purchase form
router.post('/add', requireRole('admin'), async (req, res) => {
  const { name, phone, address, gst_number } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const [result] = await db.query(
      'INSERT INTO Supplier (name, phone, address, gst_number) VALUES (?, ?, ?, ?)',
      [name, phone || null, address || null, gst_number || null]
    );
    res.status(201).json({ id: result.insertId, name, phone, address, gst_number });
  } catch (err) {
    console.error('Add supplier error:', err.message);
    res.status(500).json({ error: 'Failed to add supplier' });
  }
});

module.exports = router;