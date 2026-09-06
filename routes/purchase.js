const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /purchase — list all purchases with supplier name, most recent first
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.purchase_date, p.total_amount, s.name AS supplier_name
      FROM Purchase p
      JOIN Supplier s ON s.id = p.supplier_id
      ORDER BY p.purchase_date DESC, p.id DESC
    `);
    res.json({ purchases: rows });
  } catch (err) {
    next(err);
  }
});

// GET /purchase/add — form data (suppliers + medicines for dropdowns)
router.get('/add', requireRole('admin'), async (req, res, next) => {
  try {
    const [suppliers] = await db.query('SELECT id, name FROM Supplier ORDER BY name');
    const [medicines] = await db.query('SELECT id, name, unit FROM Medicine ORDER BY name');
    res.json({ suppliers, medicines });
  } catch (err) {
    next(err);
  }
});

// POST /purchase/add — create Purchase + PurchaseItems (+ new Batches) in one transaction
router.post('/add', requireRole('admin'), async (req, res, next) => {
  const { supplier_id, purchase_date, items } = req.body;

  // ---- Validation (before touching the DB transaction) ----
  if (!supplier_id) {
    return res.status(400).json({ error: 'supplier_id is required' });
  }
  if (!purchase_date || isNaN(Date.parse(purchase_date))) {
    return res.status(400).json({ error: 'purchase_date is required and must be a valid date' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  try {
    const [supplierRows] = await db.query('SELECT id FROM Supplier WHERE id = ?', [supplier_id]);
    if (supplierRows.length === 0) {
      return res.status(400).json({ error: 'supplier_id does not exist' });
    }
  } catch (err) {
    return next(err);
  }

  for (const [i, item] of items.entries()) {
    const { medicine_id, batch_number, expiry_date } = item;
    const quantity = Number(item.quantity);
    const purchase_price = Number(item.purchase_price);
    const selling_price = Number(item.selling_price);

    if (!medicine_id || !batch_number || !expiry_date) {
      return res.status(400).json({ error: `Item ${i}: medicine_id, batch_number, expiry_date are required` });
    }
    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ error: `Item ${i}: quantity must be a number greater than 0` });
    }
    if (isNaN(purchase_price) || purchase_price <= 0) {
      return res.status(400).json({ error: `Item ${i}: purchase_price must be a number greater than 0` });
    }
    if (isNaN(selling_price) || selling_price <= 0) {
      return res.status(400).json({ error: `Item ${i}: selling_price must be a number greater than 0` });
    }
    if (isNaN(Date.parse(expiry_date)) || new Date(expiry_date) <= new Date()) {
      return res.status(400).json({ error: `Item ${i}: expiry_date must be a valid future date` });
    }
    // Write coerced numeric values back so the insert loop below uses clean numbers
    item.quantity = quantity;
    item.purchase_price = purchase_price;
    item.selling_price = selling_price;
  }

  const total_amount = Math.round(
    items.reduce((sum, it) => sum + it.quantity * it.purchase_price, 0) * 100
  ) / 100;

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
    next(err);
  } finally {
    connection.release();
  }
});

// GET /purchase/:id — single purchase with its items
router.get('/:id', async (req, res, next) => {
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
      SELECT pi.id, pi.quantity, pi.price, b.id AS batch_id, b.batch_number, b.expiry_date, m.name AS medicine_name
      FROM PurchaseItem pi
      JOIN Batch b ON b.id = pi.batch_id
      JOIN Medicine m ON m.id = b.medicine_id
      WHERE pi.purchase_id = ?
    `, [req.params.id]);

    res.json({ purchase: purchaseRows[0], items });
  } catch (err) {
    next(err);
  }
});

// POST /purchase/:id/delete — reverse a purchase (admin only)
// Blocks the delete entirely if any of its batches have already been sold from.
router.post('/:id/delete', requireRole('admin'), async (req, res, next) => {
  const purchaseId = req.params.id;
  const connection = await db.getConnection();

  try {
    const [purchaseRows] = await connection.query('SELECT id FROM Purchase WHERE id = ?', [purchaseId]);
    if (purchaseRows.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const [items] = await connection.query(
      'SELECT batch_id FROM PurchaseItem WHERE purchase_id = ?',
      [purchaseId]
    );
    const batchIds = items.map((i) => i.batch_id);

    if (batchIds.length > 0) {
      const [soldRows] = await connection.query(
        `SELECT DISTINCT batch_id FROM SaleItem WHERE batch_id IN (?)`,
        [batchIds]
      );
      if (soldRows.length > 0) {
        connection.release();
        return res.status(409).json({
          error: 'Cannot delete: stock from this purchase has already been sold',
        });
      }
    }

    await connection.beginTransaction();

    await connection.query('DELETE FROM PurchaseItem WHERE purchase_id = ?', [purchaseId]);
    if (batchIds.length > 0) {
      await connection.query('DELETE FROM Batch WHERE id IN (?)', [batchIds]);
    }
    await connection.query('DELETE FROM Purchase WHERE id = ?', [purchaseId]);

    await connection.commit();
    res.json({ message: 'Purchase deleted and stock reversed' });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

module.exports = router;