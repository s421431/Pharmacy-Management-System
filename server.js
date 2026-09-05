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

const app = express();
const PORT = process.env.PORT || 3000;

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
});
