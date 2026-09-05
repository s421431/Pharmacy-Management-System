<<<<<<< HEAD
// config/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
=======
const mysql = require('mysql2');

// Connection pool — configure via .env (see .env.example)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pharmacy_management_system',
>>>>>>> 13ff59358dad07925d0d91d2280d8755bd10133b
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

<<<<<<< HEAD
async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 AS result');
    if (rows[0]?.result === 1) {
      console.log('✅ MySQL connection successful.');
      return true;
    }
    console.error('❌ MySQL test query returned an unexpected result:', rows);
    return false;
  } catch (err) {
    console.error('❌ MySQL connection failed.');
    console.error('   code:', err.code);
    console.error('   errno:', err.errno);
    console.error('   message:', err.message || '(empty)');
    console.error('   sqlMessage:', err.sqlMessage);
=======
const promisePool = pool.promise();

// Runs a trivial query to confirm credentials/network are good.
// Call this once at server start — don't rely on createPool() alone,
// since it doesn't actually open a connection until a query runs.
async function testConnection() {
  try {
    await promisePool.query('SELECT 1');
    console.log('✅ MySQL connected:', process.env.DB_NAME || 'pharmacy_management_system');
    return true;
  } catch (err) {
    console.error('❌ MySQL connection failed');
    console.error('   code:', err.code);
    console.error('   message:', err.message);
    console.error('   errno:', err.errno);
>>>>>>> 13ff59358dad07925d0d91d2280d8755bd10133b
    return false;
  }
}

<<<<<<< HEAD
module.exports = { pool, testConnection };
=======
module.exports = promisePool;
module.exports.testConnection = testConnection;
>>>>>>> 13ff59358dad07925d0d91d2280d8755bd10133b
