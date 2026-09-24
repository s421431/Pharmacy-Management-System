const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.purchase_date, p.total_amount, s.name AS supplier_name
      FROM Purchase p JOIN Supplier s ON s.id = p.supplier_id
      ORDER BY p.purchase_date DESC, p.id DESC
    `);
    res.render('purchase/list', { purchases: rows, error: req.query.error || null });
  } catch (err) {
    next(err);
  }
});

router.get('/add', requireRole('admin'), async (req, res, next) => {
  try {
    const [suppliers] = await db.query('SELECT id, name FROM Supplier ORDER BY name');
    const [medicines] = await db.query('SELECT id, name, unit FROM Medicine ORDER BY name');
    res.render('purchase/add', { suppliers, medicines, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/add', requireRole('admin'), async (req, res, next) => {
  const { supplier_id, purchase_date, items } = req.body;

  const rerender = async (error) => {
    const [suppliers] = await db.query('SELECT id, name FROM Supplier ORDER BY name');
    const [medicines] = await db.query('SELECT id, name, unit FROM Medicine ORDER BY name');
    res.status(400).render('purchase/add', { suppliers, medicines, error });
  };

  if (!supplier_id || !purchase_date || !items) {
    return rerender('supplier_id, purchase_date, and at least one item are required');
  }

  const itemsArray = Object.values(items).map((it) => ({
    medicine_id: it.medicine_id,
    batch_number: it.batch_number,
    expiry_date: it.expiry_date,
    quantity: Number(it.quantity),
    purchase_price: Number(it.purchase_price),
    selling_price: Number(it.selling_price),
  }));

  for (const [i, item] of itemsArray.entries()) {
    if (!item.medicine_id || !item.batch_number || !item.expiry_date) {
      return rerender(`Item ${i + 1}: medicine, batch number, expiry date are required`);
    }
    if (isNaN(item.quantity) || item.quantity <= 0) return rerender(`Item ${i + 1}: quantity must be > 0`);
    if (isNaN(item.purchase_price) || item.purchase_price <= 0) return rerender(`Item ${i + 1}: purchase price must be > 0`);
    if (isNaN(item.selling_price) || item.selling_price <= 0) return rerender(`Item ${i + 1}: selling price must be > 0`);
    if (isNaN(Date.parse(item.expiry_date)) || new Date(item.expiry_date) <= new Date()) {
      return rerender(`Item ${i + 1}: expiry date must be in the future`);
    }
  }

  try {
    const [supplierRows] = await db.query('SELECT id FROM Supplier WHERE id = ?', [supplier_id]);
    if (supplierRows.length === 0) return rerender('Selected supplier does not exist');
  } catch (err) {
    return next(err);
  }

  const total_amount = Math.round(
    itemsArray.reduce((sum, it) => sum + it.quantity * it.purchase_price, 0) * 100
  ) / 100;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [purchaseResult] = await connection.query(
      'INSERT INTO Purchase (supplier_id, purchase_date, total_amount) VALUES (?, ?, ?)',
      [supplier_id, purchase_date, total_amount]
    );
    const purchaseId = purchaseResult.insertId;

    for (const item of itemsArray) {
      const [batchResult] = await connection.query(
        `INSERT INTO Batch (medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [item.medicine_id, item.batch_number, item.expiry_date, item.quantity, item.purchase_price, item.selling_price]
      );
      await connection.query(
        'INSERT INTO PurchaseItem (purchase_id, batch_id, quantity, price) VALUES (?, ?, ?, ?)',
        [purchaseId, batchResult.insertId, item.quantity, item.purchase_price]
      );
    }

    await connection.commit();
    res.redirect('/purchase/' + purchaseId);
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [purchaseRows] = await db.query(`
      SELECT p.id, p.purchase_date, p.total_amount, s.name AS supplier_name
      FROM Purchase p JOIN Supplier s ON s.id = p.supplier_id WHERE p.id = ?
    `, [req.params.id]);
    if (purchaseRows.length === 0) return res.redirect('/purchase');

    const [items] = await db.query(`
      SELECT pi.quantity, pi.price, b.batch_number, b.expiry_date, m.name AS medicine_name
      FROM PurchaseItem pi JOIN Batch b ON b.id = pi.batch_id JOIN Medicine m ON m.id = b.medicine_id
      WHERE pi.purchase_id = ?
    `, [req.params.id]);

    res.render('purchase/detail', { purchase: purchaseRows[0], items });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/delete', requireRole('admin'), async (req, res, next) => {
  const purchaseId = req.params.id;
  const connection = await db.getConnection();
  try {
    const [purchaseRows] = await connection.query('SELECT id FROM Purchase WHERE id = ?', [purchaseId]);
    if (purchaseRows.length === 0) {
      connection.release();
      return res.redirect('/purchase');
    }
    const [items] = await connection.query('SELECT batch_id FROM PurchaseItem WHERE purchase_id = ?', [purchaseId]);
    const batchIds = items.map((i) => i.batch_id);

    if (batchIds.length > 0) {
      const [soldRows] = await connection.query('SELECT DISTINCT batch_id FROM SaleItem WHERE batch_id IN (?)', [batchIds]);
      if (soldRows.length > 0) {
        connection.release();
        return res.redirect('/purchase?error=' + encodeURIComponent('Cannot delete: stock from this purchase has already been sold'));
      }
    }

    await connection.beginTransaction();
    await connection.query('DELETE FROM PurchaseItem WHERE purchase_id = ?', [purchaseId]);
    if (batchIds.length > 0) await connection.query('DELETE FROM Batch WHERE id IN (?)', [batchIds]);
    await connection.query('DELETE FROM Purchase WHERE id = ?', [purchaseId]);
    await connection.commit();
    res.redirect('/purchase');
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

module.exports = router;