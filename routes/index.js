const express = require('express');
const router = express.Router();

// GET / - setup verification route
router.get('/', (req, res) => {
  res.render('dashboard');
});

module.exports = router;
