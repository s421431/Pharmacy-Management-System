const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { generateInvoiceNumber } = require('../utils/invoiceNumber');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [medicines] = await db.query(`
      SELECT DISTINCT m.id, m.name, m.gst_percent, m.unit
      FROM Medicine m JOIN Batch b ON b.medicine_id = m.id
      WHERE b.quantity > 0 AND b.expiry_date > CURDATE()
      ORDER BY m.name
    `);
    const [customers] = await db.query('SELECT id, name, phone FROM Customer ORDER BY name');
    res.render('billing/create', { medicines, customers, error: null });
  } catch (err) {
    next(err);
  }
});

router.get('/batch-lookup/:medicineId', async (req, res, next) => {
  try {
    const [batches] = await db.query(`
      SELECT id AS batch_id, expiry_date, quantity, selling_price
      FROM Batch WHERE medicine_id = ? AND quantity > 0 AND expiry_date > CURDATE()
      ORDER BY expiry_date ASC
    `, [req.params.medicineId]);
    res.json({ batches });
  } catch (err) {
    next(err);
  }
});

router.post('/create', async (req, res, next) => {
  const { customer_id, items } = req.body;

  const rerender = async (error) => {
    const [medicines] = await db.query(`
      SELECT DISTINCT m.id, m.name, m.gst_percent, m.unit
      FROM Medicine m JOIN Batch b ON b.medicine_id = m.id
      WHERE b.quantity > 0 AND b.expiry_date > CURDATE() ORDER BY m.name
    `);
    const [customers] = await db.query('SELECT id, name, phone FROM Customer ORDER BY name');
    res.status(400).render('billing/create', { medicines, customers, error });
  };

  if (!items) return rerender('At least one item is required');
  const itemsArray = Object.values(items).map((it) => ({ batch_id: it.batch_id, quantity: Number(it.quantity) }));

  for (const [i, item] of itemsArray.entries()) {
    if (!item.batch_id || isNaN(item.quantity) || item.quantity <= 0) {
      return rerender(`Item ${i + 1}: batch and quantity (> 0) are required`);
    }
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    let subtotal = 0, gstAmount = 0;
    const saleItemRows = [];

    for (const item of itemsArray) {
      const [rows] = await connection.query(
        `SELECT b.id, b.quantity, b.selling_price, m.gst_percent
         FROM Batch b JOIN Medicine m ON m.id = b.medicine_id WHERE b.id = ? FOR UPDATE`,
        [item.batch_id]
      );
      const batch = rows[0];
      if (!batch) throw Object.assign(new Error(`Batch not found`), { status: 400 });
      if (batch.quantity < item.quantity) {
        throw Object.assign(new Error(`Insufficient stock (available: ${batch.quantity})`), { status: 409 });
      }
      const lineSubtotal = item.quantity * Number(batch.selling_price);
      const lineGst = Math.round(lineSubtotal * (Number(batch.gst_percent) / 100) * 100) / 100;
      subtotal += lineSubtotal;
      gstAmount += lineGst;
      await connection.query('UPDATE Batch SET quantity = quantity - ? WHERE id = ?', [item.quantity, item.batch_id]);
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
      await connection.query('INSERT INTO SaleItem (sale_id, batch_id, quantity, price) VALUES (?, ?, ?, ?)', [saleId, row.batch_id, row.quantity, row.price]);
    }

    await connection.commit();
    res.redirect('/billing/' + saleId);
  } catch (err) {
    await connection.rollback();
    if (err.status) return rerender(err.message);
    next(err);
  } finally {
    connection.release();
  }
});

router.get('/history', async (req, res, next) => {
  const { search } = req.query;
  try {
    let sql = `
      SELECT s.id, s.invoice_number, s.sale_date, s.total_amount, s.gst_amount, c.name AS customer_name
      FROM Sale s LEFT JOIN Customer c ON c.id = s.customer_id
    `;
    const params = [];
    if (search) {
      sql += ' WHERE s.invoice_number LIKE ? OR c.name LIKE ? ';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY s.sale_date DESC, s.id DESC';
    const [sales] = await db.query(sql, params);
    res.render('billing/history', { sales, search: search || '' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [saleRows] = await db.query(`
      SELECT s.id, s.invoice_number, s.sale_date, s.total_amount, s.gst_amount,
             c.name AS customer_name, u.name AS billed_by
      FROM Sale s LEFT JOIN Customer c ON c.id = s.customer_id JOIN User u ON u.id = s.user_id
      WHERE s.id = ?
    `, [req.params.id]);
    if (saleRows.length === 0) return res.redirect('/billing/history');

    const [items] = await db.query(`
      SELECT si.quantity, si.price, m.name AS medicine_name, b.batch_number
      FROM SaleItem si JOIN Batch b ON b.id = si.batch_id JOIN Medicine m ON m.id = b.medicine_id
      WHERE si.sale_id = ?
    `, [req.params.id]);

    res.render('billing/invoice', { sale: saleRows[0], items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;