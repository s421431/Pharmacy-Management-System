const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /purchase — list all purchases with supplier name, most recent first
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.purchase_date, p.total_amount, s.name AS supplier_name
      FROM Purchase p
      JOIN Supplier s ON s.id = p.supplier_id
      ORDER BY p.purchase_date DESC, p.id DESC
    `);
    res.json({ purchases: rows });
  } catch (err) {
    console.error('Purchase list error:', err.message);
    res.status(500).json({ error: 'Failed to load purchases' });
  }
});

// GET /purchase/add — form data (suppliers + medicines for dropdowns)
router.get('/add', requireRole('admin'), async (req, res) => {
  try {
    const [suppliers] = await db.query('SELECT id, name FROM Supplier ORDER BY name');
    const [medicines] = await db.query('SELECT id, name, unit FROM Medicine ORDER BY name');
    res.json({ suppliers, medicines });
  } catch (err) {
    console.error('Purchase form error:', err.message);
    res.status(500).json({ error: 'Failed to load form data' });
  }
});

// POST /purchase/add — create Purchase + PurchaseItems (+ new Batches) in one transaction
router.post('/add', requireRole('admin'), async (req, res) => {
  const { supplier_id, purchase_date, items } = req.body;

  if (!supplier_id || !purchase_date || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'supplier_id, purchase_date, and at least one item are required' });
  }

  // Validate every item BEFORE opening the transaction — fail fast, no DB work wasted
  for (const [i, item] of items.entries()) {
    const { medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price } = item;
    if (!medicine_id || !batch_number || !expiry_date) {
      return res.status(400).json({ error: `Item ${i}: medicine_id, batch_number, expiry_date are required` });
    }
    if (Number(quantity) <= 0) {
      return res.status(400).json({ error: `Item ${i}: quantity must be greater than 0` });
    }
    if (Number(purchase_price) <= 0 || Number(selling_price) <= 0) {
      return res.status(400).json({ error: `Item ${i}: prices must be greater than 0` });
    }
    if (new Date(expiry_date) <= new Date()) {
      return res.status(400).json({ error: `Item ${i}: expiry_date must be in the future` });
    }
  }

  const total_amount = items.reduce(
    (sum, it) => sum + Number(it.quantity) * Number(it.purchase_price),
    0
  );

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [purchaseResult] = await connection.query(
      'INSERT INTO Purchase (supplier_id, purchase_date, total_amount) VALUES (?, ?, ?)',
      [supplier_id, purchase_date, total_amount]
    );
    const purchaseId = purchaseResult.insertId;

    for (const item of items) {
      const { medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price } = item;

      const [batchResult] = await connection.query(
        `INSERT INTO Batch (medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price]
      );
      const batchId = batchResult.insertId;

      await connection.query(
        'INSERT INTO PurchaseItem (purchase_id, batch_id, quantity, price) VALUES (?, ?, ?, ?)',
        [purchaseId, batchId, quantity, purchase_price]
      );
    }

    await connection.commit();
    res.status(201).json({ id: purchaseId, total_amount });
  } catch (err) {
    await connection.rollback();
    console.error('Create purchase error:', err.message);
    res.status(500).json({ error: 'Failed to create purchase, rolled back' });
  } finally {
    connection.release();
  }
});

// GET /purchase/:id — single purchase with its items
router.get('/:id', async (req, res) => {
  try {
    const [purchaseRows] = await db.query(`
      SELECT p.id, p.purchase_date, p.total_amount, s.name AS supplier_name
      FROM Purchase p
      JOIN Supplier s ON s.id = p.supplier_id
      WHERE p.id = ?
    `, [req.params.id]);

    if (purchaseRows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const [items] = await db.query(`
      SELECT pi.id, pi.quantity, pi.price, b.batch_number, b.expiry_date, m.name AS medicine_name
      FROM PurchaseItem pi
      JOIN Batch b ON b.id = pi.batch_id
      JOIN Medicine m ON m.id = b.medicine_id
      WHERE pi.purchase_id = ?
    `, [req.params.id]);

    res.json({ purchase: purchaseRows[0], items });
  } catch (err) {
    console.error('Purchase detail error:', err.message);
    res.status(500).json({ error: 'Failed to load purchase' });
  }
});

module.exports = router;