const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

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
    res.render('inventory/list', { medicines, search: search || '' });
  } catch (err) {
    next(err);
  }
});

router.get('/add', requireRole('admin'), (req, res) => {
  res.render('inventory/add-medicine', { error: null });
});

router.post('/add', requireRole('admin'), async (req, res, next) => {
  const { name, category, gst_percent, unit } = req.body;
  if (!name || !unit) {
    return res.status(400).render('inventory/add-medicine', { error: 'name and unit are required' });
  }
  const gst = gst_percent === undefined || gst_percent === '' ? 0 : Number(gst_percent);
  if (isNaN(gst) || gst < 0) {
    return res.status(400).render('inventory/add-medicine', { error: 'gst_percent must be a non-negative number' });
  }
  try {
    await db.query(
      'INSERT INTO Medicine (name, category, gst_percent, unit) VALUES (?, ?, ?, ?)',
      [name, category || null, gst, unit]
    );
    res.redirect('/inventory');
  } catch (err) {
    next(err);
  }
});

router.get('/:id/add-batch', requireRole('admin'), async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT id, name FROM Medicine WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/inventory');
    res.render('inventory/add-batch', { medicine: rows[0], error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/add-batch', requireRole('admin'), async (req, res, next) => {
  const medicineId = req.params.id;
  const { batch_number, expiry_date, quantity, purchase_price, selling_price } = req.body;

  let medicine;
  try {
    const [medRows] = await db.query('SELECT id, name FROM Medicine WHERE id = ?', [medicineId]);
    if (medRows.length === 0) return res.redirect('/inventory');
    medicine = medRows[0];
  } catch (err) {
    return next(err);
  }

  const qty = Number(quantity);
  const purchasePrice = Number(purchase_price);
  const sellingPrice = Number(selling_price);

  if (!batch_number || !expiry_date) {
    return res.status(400).render('inventory/add-batch', { medicine, error: 'All batch fields are required' });
  }
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).render('inventory/add-batch', { medicine, error: 'quantity must be greater than 0' });
  }
  if (isNaN(purchasePrice) || purchasePrice <= 0 || isNaN(sellingPrice) || sellingPrice <= 0) {
    return res.status(400).render('inventory/add-batch', { medicine, error: 'prices must be greater than 0' });
  }
  if (isNaN(Date.parse(expiry_date)) || new Date(expiry_date) <= new Date()) {
    return res.status(400).render('inventory/add-batch', { medicine, error: 'expiry_date must be in the future' });
  }

  try {
    await db.query(
      `INSERT INTO Batch (medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [medicineId, batch_number, expiry_date, qty, purchasePrice, sellingPrice]
    );
    res.redirect('/inventory');
  } catch (err) {
    next(err);
  }
});

router.post('/batch/:batchId/delete', requireRole('admin'), async (req, res, next) => {
  try {
    const [result] = await db.query('DELETE FROM Batch WHERE id = ?', [req.params.batchId]);
    if (result.affectedRows === 0) return res.redirect('/inventory');
    res.redirect('/inventory');
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.redirect('/inventory?error=' + encodeURIComponent('Cannot delete: batch is referenced in purchase/sale records'));
    }
    next(err);
  }
});

router.get('/low-stock', async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT m.id, m.name, m.unit, COALESCE(SUM(b.quantity), 0) AS total_quantity
      FROM Medicine m LEFT JOIN Batch b ON b.medicine_id = m.id
      GROUP BY m.id HAVING total_quantity < 10 ORDER BY total_quantity ASC
    `);
    res.render('inventory/low-stock', { medicines: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/near-expiry', async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT b.id AS batch_id, b.batch_number, b.expiry_date, b.quantity,
             m.id AS medicine_id, m.name AS medicine_name
      FROM Batch b JOIN Medicine m ON m.id = b.medicine_id
      WHERE b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND b.quantity > 0
      ORDER BY b.expiry_date ASC
    `);
    res.render('inventory/near-expiry', { batches: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;