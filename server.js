<<<<<<< HEAD
// server.js
// Entry point: configures Express, view engine, static assets, and routes.

require('dotenv').config();
const express = require('express');
const path = require('path');

const indexRoutes = require('./routes/index');
const { testConnection } = require('./config/db');
=======
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const purchaseRoutes = require('./routes/purchase');
const supplierRoutes = require('./routes/supplier');
const db = require('./config/db');
>>>>>>> 13ff59358dad07925d0d91d2280d8755bd10133b

const app = express();
const PORT = process.env.PORT || 3000;

<<<<<<< HEAD
// View engine setup (EJS templates live in /views)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static assets (CSS, client JS, images) from /public
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON / form bodies (useful once you add forms for pharmacy data)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/', indexRoutes);

app.listen(PORT, async () => {
  console.log(`Pharmacy Management System running at http://localhost:${PORT}`);

  // Verify the DB is reachable as soon as the server comes up, so a bad
  // .env or a stopped MySQL instance shows up immediately in the logs
  // instead of surfacing later as a confusing query error.
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('⚠️  Server is running, but database connection failed. Check your .env values.');
  }
=======
// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing (useful once forms/APIs are added)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions (used for login state)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
}));

// Routes
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/purchase', purchaseRoutes);
app.use('/suppliers', supplierRoutes);

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  await db.testConnection();
>>>>>>> 13ff59358dad07925d0d91d2280d8755bd10133b
});
