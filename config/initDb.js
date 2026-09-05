require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, '../models/schema.sql'), 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pharmacy_management_system',
    multipleStatements: true, // required to run a multi-statement .sql file
  });

  try {
    await connection.query(schema);
    console.log('✅ Schema applied successfully.');
  } catch (err) {
    console.error('❌ Failed to apply schema:', err.message);
  } finally {
    await connection.end();
  }
}

initDb();
