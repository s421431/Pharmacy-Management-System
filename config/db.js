// config/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

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
    return false;
  }
}

<<<<<<< HEAD
module.exports = { pool, testConnection };
=======
module.exports = pool;
module.exports.testConnection = testConnection;
>>>>>>> 632f1bce62747a8861f8be11fc2031b7028c5794
