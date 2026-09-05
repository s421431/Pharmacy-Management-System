// server.js
// Entry point: configures Express, view engine, static assets, and routes.

require('dotenv').config();
const express = require('express');
const path = require('path');

const indexRoutes = require('./routes/index');
const { testConnection } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

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
});
