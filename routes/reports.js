const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [[todayRow]] = await db.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM Sale WHERE sale_date = CURDATE()`);
    const [[monthRow]] = await db.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total, COALESCE(SUM(gst_amount), 0) AS gst FROM Sale
      WHERE YEAR(sale_date) = YEAR(CURDATE()) AND MONTH(sale_date) = MONTH(CURDATE())
    `);
    const [topMedicines] = await db.query(`
      SELECT m.name, SUM(si.quantity) AS total_quantity_sold
      FROM SaleItem si JOIN Batch b ON b.id = si.batch_id JOIN Medicine m ON m.id = b.medicine_id JOIN Sale s ON s.id = si.sale_id
      WHERE YEAR(s.sale_date) = YEAR(CURDATE()) AND MONTH(s.sale_date) = MONTH(CURDATE())
      GROUP BY m.id ORDER BY total_quantity_sold DESC LIMIT 5
    `);
    const [[lowStockRow]] = await db.query(`
      SELECT COUNT(*) AS count FROM (
        SELECT m.id, COALESCE(SUM(b.quantity), 0) AS total_quantity FROM Medicine m
        LEFT JOIN Batch b ON b.medicine_id = m.id GROUP BY m.id HAVING total_quantity < 10
      ) AS low_stock
    `);
    const [[nearExpiryRow]] = await db.query(`
      SELECT COUNT(*) AS count FROM Batch WHERE expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND quantity > 0
    `);

    res.render('reports/dashboard', {
      sales_today: Number(todayRow.total),
      sales_this_month: Number(monthRow.total),
      gst_this_month: Number(monthRow.gst),
      top_medicines: topMedicines,
      low_stock_count: lowStockRow.count,
      near_expiry_count: nearExpiryRow.count,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/sales', async (req, res, next) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.render('reports/sales', { sales: [], total_amount: 0, total_gst: 0, from: '', to: '', error: null });
  }
  if (isNaN(Date.parse(from)) || isNaN(Date.parse(to)) || from > to) {
    return res.render('reports/sales', { sales: [], total_amount: 0, total_gst: 0, from, to, error: 'Invalid date range' });
  }
  try {
    const [sales] = await db.query(`
      SELECT s.id, s.invoice_number, s.sale_date, s.total_amount, s.gst_amount, c.name AS customer_name
      FROM Sale s LEFT JOIN Customer c ON c.id = s.customer_id
      WHERE s.sale_date BETWEEN ? AND ? ORDER BY s.sale_date DESC
    `, [from, to]);
    const [[totalsRow]] = await db.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total, COALESCE(SUM(gst_amount), 0) AS gst FROM Sale WHERE sale_date BETWEEN ? AND ?
    `, [from, to]);
    res.render('reports/sales', { sales, total_amount: Number(totalsRow.total), total_gst: Number(totalsRow.gst), from, to, error: null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;