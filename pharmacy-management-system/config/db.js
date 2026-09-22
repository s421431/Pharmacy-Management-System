const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pharmacy_management_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const promisePool = pool.promise();

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
  return false;
}
}

module.exports = promisePool;
module.exports.testConnection = testConnection;