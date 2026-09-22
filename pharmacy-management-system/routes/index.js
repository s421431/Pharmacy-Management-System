const express = require('express');
const router = express.Router();

// GET / - setup verification route
router.get('/', (req, res) => {
  res.render('index', { message: 'Pharmacy Management System - Setup OK' });
});

module.exports = router;
