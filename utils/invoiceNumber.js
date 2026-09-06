const db = require('../config/db');

/**
 * Generates a unique, sequential invoice number like INV-2026-0001.
 * Must be called with an active transaction connection (the same one
 * used to insert the Sale row) so the counter increment and the Sale
 * insert commit/rollback together.
 *
 * Uses MySQL's LAST_INSERT_ID(expr) trick on an UPSERT to atomically
 * increment per-year — this is safe under concurrent requests because
 * the UPDATE takes a row-level lock for the duration of the transaction,
 * unlike a plain SELECT MAX(...) + increment in application code.
 */
async function generateInvoiceNumber(connection) {
  const year = new Date().getFullYear();

  await connection.query(
    `INSERT INTO InvoiceCounter (year, last_number) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE last_number = LAST_INSERT_ID(last_number + 1)`,
    [year]
  );
  const [rows] = await connection.query('SELECT LAST_INSERT_ID() AS next_number');
  const nextNumber = rows[0].next_number;

  const padded = String(nextNumber).padStart(4, '0');
  return `INV-${year}-${padded}`;
}

module.exports = { generateInvoiceNumber };