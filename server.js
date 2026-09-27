// server.js
// Entry point: configures Express, view engine, static assets, and routes.

require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
// const inventoryRoutes = require('./routes/inventory'); // MySQL version — not wired in yet, see routes/index.js for the mock-data /inventory routes currently in use
const purchaseRoutes = require('./routes/purchase');
const supplierRoutes = require('./routes/supplier');
const billingRoutes = require('./routes/billing');
const reportsRoutes = require('./routes/reports');
const errorHandler = require('./middleware/errorHandler');
const { testConnection } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'pharmacy-dev-secret-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hour session
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use('/', authRoutes);
// app.use('/inventory', inventoryRoutes); // re-enable once mock data is migrated to MySQL and Medicine/Batch tables exist
app.use('/', indexRoutes); // handles /inventory (mock data), /dashboard, purchase, billing routes, etc.
app.use('/purchase', purchaseRoutes);
app.use('/suppliers', supplierRoutes);
app.use('/billing', billingRoutes);
app.use('/reports', reportsRoutes);
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`Pharmacy Management System running at http://localhost:${PORT}`);

  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('⚠️  Server is running, but database connection failed. Check your .env values.');
  }
});