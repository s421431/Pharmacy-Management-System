const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /inventory — medicine list with total stock qty + nearest expiry per medicine.
router.get('/', async (req, res, next) => {
  const { search } = req.query;
  try {
    let sql = `
      SELECT m.id, m.name, m.category, m.gst_percent, m.unit,
             COALESCE(SUM(b.quantity), 0) AS total_quantity,
             MIN(CASE WHEN b.quantity > 0 THEN b.expiry_date END) AS nearest_expiry
      FROM Medicine m
      LEFT JOIN Batch b ON b.medicine_id = m.id
    `;
    const params = [];
    if (search) {
      sql += ' WHERE m.name LIKE ? ';
      params.push(`%${search}%`);
    }
    sql += ' GROUP BY m.id ORDER BY m.name ASC';

    const [medicines] = await db.query(sql, params);
    res.json({ medicines });
  } catch (err) {
    console.error('Inventory list error:', err.message);
    res.status(500).json({ error: 'Failed to load inventory' });
  }
});

// GET /inventory/add — form data for adding a new medicine (admin only)
router.get('/add', requireRole('admin'), (req, res) => {
  res.json({ form: 'add-medicine' });
});

// POST /inventory/add — create a new medicine (admin only)
router.post('/add', requireRole('admin'), async (req, res, next) => {
  const { name, category, gst_percent, unit } = req.body;
  
  if (!name || !unit) {
    return res.status(400).json({ error: 'name and unit are required' });
  }

  const gst = gst_percent === undefined || gst_percent === '' ? 0 : Number(gst_percent);
  if (isNaN(gst) || gst < 0) {
    return res.status(400).json({ error: 'gst_percent must be a non-negative number' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO Medicine (name, category, gst_percent, unit) VALUES (?, ?, ?, ?)',
      [name, category || null, gst, unit]
    );
    res.status(201).json({ id: result.insertId, name, category, gst_percent: gst, unit });
  } catch (err) {
    console.error('Add medicine error:', err.message);
    res.status(500).json({ error: 'Failed to add medicine' });
  }
});

// GET /inventory/:id/add-batch — form data for adding a batch
router.get('/:id/add-batch', requireRole('admin'), async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT id, name FROM Medicine WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found' });
    }
    res.json({ medicine: rows[0] });
  } catch (err) {
    console.error('Add-batch form error:', err.message);
    res.status(500).json({ error: 'Failed to load medicine' });
  }
});

// POST /inventory/:id/add-batch — insert a batch for a medicine
router.post('/:id/add-batch', requireRole('admin'), async (req, res, next) => {
  const medicineId = req.params.id;
  const { batch_number, expiry_date, quantity, purchase_price, selling_price } = req.body;

  if (!batch_number || !expiry_date || !quantity || !purchase_price || !selling_price) {
    return res.status(400).json({ error: 'All batch fields are required' });
  }

  const qty = Number(quantity);
  const purchasePrice = Number(purchase_price);
  const sellingPrice = Number(selling_price);

  if (isNaN(qty) || qty <= 0) {  
    return res.status(400).json({ error: 'quantity must be greater than 0' });
  }
  if (isNaN(purchasePrice) || purchasePrice <= 0) {
    return res.status(400).json({ error: 'purchase_price must be a number greater than 0' });
  }
  if (isNaN(sellingPrice) || sellingPrice <= 0) {
    return res.status(400).json({ error: 'selling_price must be a number greater than 0' });
  }
  if (isNaN(Date.parse(expiry_date)) || new Date(expiry_date) <= new Date()) {
    return res.status(400).json({ error: 'expiry_date must be in the future' });
  }

  try {
    const [medRows] = await db.query('SELECT id FROM Medicine WHERE id = ?', [medicineId]);
    if (medRows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    const [result] = await db.query(
      `INSERT INTO Batch (medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [medicineId, batch_number, expiry_date, qty, purchasePrice, sellingPrice]
    );
    res.status(201).json({ id: result.insertId, medicine_id: medicineId, batch_number, expiry_date, quantity: qty });
  } catch (err) {
    console.error('Add batch error:', err.message);
    res.status(500).json({ error: 'Failed to add batch' });
  }
});

// POST /inventory/batch/:batchId/delete — delete a batch
router.post('/batch/:batchId/delete', requireRole('admin'), async (req, res, next) => {
  try {
    const [result] = await db.query('DELETE FROM Batch WHERE id = ?', [req.params.batchId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.json({ message: 'Batch deleted' });
  } catch (err) {
    console.error('Delete batch error:', err.message);
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'Cannot delete: batch is referenced in purchase/sale records' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /inventory/low-stock — medicines whose total batch quantity < 10
router.get('/low-stock', async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT m.id, m.name, m.unit, COALESCE(SUM(b.quantity), 0) AS total_quantity
      FROM Medicine m
      LEFT JOIN Batch b ON b.medicine_id = m.id
      GROUP BY m.id
      HAVING total_quantity < 10
      ORDER BY total_quantity ASC
    `);
    res.json({ medicines: rows });
  } catch (err) {
    console.error('Low-stock error:', err.message);
    res.status(500).json({ error: 'Failed to load low-stock list' });
  }
});

// GET /inventory/near-expiry — batches expiring within 30 days
router.get('/near-expiry', async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT b.id AS batch_id, b.batch_number, b.expiry_date, b.quantity,
             m.id AS medicine_id, m.name AS medicine_name
      FROM Batch b
      JOIN Medicine m ON m.id = b.medicine_id
      WHERE b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        AND b.quantity > 0
      ORDER BY b.expiry_date ASC
    `);
    res.json({ batches: rows });
  } catch (err) {
    console.error('Near-expiry error:', err.message);
    res.status(500).json({ error: 'Failed to load near-expiry list' });
  }
});

module.exports = router;