const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { generateInvoiceNumber } = require('../utils/invoiceNumber');

router.use(requireAuth);

// GET /billing — data for the billing screen
router.get('/', async (req, res, next) => {
  try {
    const [medicines] = await db.query(`
      SELECT DISTINCT m.id, m.name, m.gst_percent, m.unit
      FROM Medicine m
      JOIN Batch b ON b.medicine_id = m.id
      WHERE b.quantity > 0 AND b.expiry_date > CURDATE()
      ORDER BY m.name
    `);
    const [customers] = await db.query('SELECT id, name, phone FROM Customer ORDER BY name');
    res.json({ medicines, customers });
  } catch (err) {
    next(err);
  }
});

// GET /billing/batch-lookup/:medicineId — available batches, oldest expiry first
router.get('/batch-lookup/:medicineId', async (req, res, next) => {
  try {
    const [batches] = await db.query(`
      SELECT id AS batch_id, expiry_date, quantity, selling_price
      FROM Batch
      WHERE medicine_id = ? AND quantity > 0 AND expiry_date > CURDATE()
      ORDER BY expiry_date ASC
    `, [req.params.medicineId]);
    res.json({ batches });
  } catch (err) {
    next(err);
  }
});

// POST /billing/create — Sale + SaleItems in one transaction, with row locking
router.post('/create', async (req, res, next) => {
  const { customer_id, items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }
  for (const [i, item] of items.entries()) {
    const qty = Number(item.quantity);
    if (!item.batch_id || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: `Item ${i}: batch_id and quantity (> 0) are required` });
    }
    item.quantity = qty;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    let subtotal = 0;
    let gstAmount = 0;
    const saleItemRows = [];

    for (const item of items) {
      // Lock the batch row so concurrent sales can't both read stale stock
      const [rows] = await connection.query(
        `SELECT b.id, b.quantity, b.selling_price, m.gst_percent
         FROM Batch b
         JOIN Medicine m ON m.id = b.medicine_id
         WHERE b.id = ? FOR UPDATE`,
        [item.batch_id]
      );
      const batch = rows[0];

      if (!batch) {
        throw Object.assign(new Error(`Batch ${item.batch_id} not found`), { status: 400 });
      }
      if (batch.quantity < item.quantity) {
        throw Object.assign(
          new Error(`Insufficient stock for batch ${item.batch_id} (available: ${batch.quantity})`),
          { status: 409 }
        );
      }

      const lineSubtotal = item.quantity * Number(batch.selling_price);
      const lineGst = Math.round(lineSubtotal * (Number(batch.gst_percent) / 100) * 100) / 100;

      subtotal += lineSubtotal;
      gstAmount += lineGst;

      await connection.query('UPDATE Batch SET quantity = quantity - ? WHERE id = ?', [
        item.quantity,
        item.batch_id,
      ]);

      saleItemRows.push({ batch_id: item.batch_id, quantity: item.quantity, price: batch.selling_price });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    gstAmount = Math.round(gstAmount * 100) / 100;
    const total_amount = Math.round((subtotal + gstAmount) * 100) / 100;

    const invoice_number = await generateInvoiceNumber(connection);

    const [saleResult] = await connection.query(
      `INSERT INTO Sale (invoice_number, customer_id, user_id, sale_date, total_amount, gst_amount)
       VALUES (?, ?, ?, CURDATE(), ?, ?)`,
      [invoice_number, customer_id || null, req.session.user.id, total_amount, gstAmount]
    );
    const saleId = saleResult.insertId;

    for (const row of saleItemRows) {
      await connection.query(
        'INSERT INTO SaleItem (sale_id, batch_id, quantity, price) VALUES (?, ?, ?, ?)',
        [saleId, row.batch_id, row.quantity, row.price]
      );
    }

    await connection.commit();
    res.status(201).json({ id: saleId, invoice_number, total_amount, gst_amount: gstAmount });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

// GET /billing/history — all sales, most recent first, search by invoice_number or customer name
router.get('/history', async (req, res, next) => {
  const { search } = req.query;
  try {
    let sql = `
      SELECT s.id, s.invoice_number, s.sale_date, s.total_amount, s.gst_amount,
             c.name AS customer_name, u.name AS billed_by
      FROM Sale s
      LEFT JOIN Customer c ON c.id = s.customer_id
      JOIN User u ON u.id = s.user_id
    `;
    const params = [];
    if (search) {
      sql += ' WHERE s.invoice_number LIKE ? OR c.name LIKE ? ';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY s.sale_date DESC, s.id DESC';

    const [sales] = await db.query(sql, params);
    res.json({ sales });
  } catch (err) {
    next(err);
  }
});

// GET /billing/:id — single sale with items (for print-friendly invoice)
router.get('/:id', async (req, res, next) => {
  try {
    const [saleRows] = await db.query(`
      SELECT s.id, s.invoice_number, s.sale_date, s.total_amount, s.gst_amount,
             c.name AS customer_name, c.phone AS customer_phone, u.name AS billed_by
      FROM Sale s
      LEFT JOIN Customer c ON c.id = s.customer_id
      JOIN User u ON u.id = s.user_id
      WHERE s.id = ?
    `, [req.params.id]);

    if (saleRows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const [items] = await db.query(`
      SELECT si.quantity, si.price, m.name AS medicine_name, b.batch_number
      FROM SaleItem si
      JOIN Batch b ON b.id = si.batch_id
      JOIN Medicine m ON m.id = b.medicine_id
      WHERE si.sale_id = ?
    `, [req.params.id]);

    res.json({ sale: saleRows[0], items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;