// routes/index.js
const express = require('express');
const router = express.Router();

// Mock in-memory data (replace with MySQL queries if using DB)
let medicines = [
  {
    id: '1',
    name: 'Amoxicillin 500mg',
    category: 'Antibiotics',
    gst_percent: 12,
    unit: 'Strip',
    total_quantity: 200,
    nearest_expiry: '2027-03-03',
    batches: [
      { id: 'b1', batch_number: 'AMX-01', expiry_date: '2027-03-03', quantity: 120, purchase_price: 65, selling_price: 85 },
      { id: 'b2', batch_number: 'AMX-02', expiry_date: '2027-08-15', quantity: 80, purchase_price: 64, selling_price: 85 }
    ]
  },
  {
    id: '2',
    name: 'Azithromycin 250mg',
    category: 'Antibiotics',
    gst_percent: 12,
    unit: 'Strip',
    total_quantity: 45,
    nearest_expiry: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    batches: [
      { id: 'b3', batch_number: 'AZT-99', expiry_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], quantity: 45, purchase_price: 90, selling_price: 115 }
    ]
  },
  {
    id: '3',
    name: 'Insulin Glargine 100IU',
    category: 'Antidiabetic',
    gst_percent: 5,
    unit: 'Vial',
    total_quantity: 6,
    nearest_expiry: '2027-01-20',
    batches: [
      { id: 'b4', batch_number: 'INS-04', expiry_date: '2027-01-20', quantity: 6, purchase_price: 450, selling_price: 520 }
    ]
  }
];

// Mock in-memory suppliers
let suppliers = [
  { id: 's1', name: 'MedSupply Co.', phone: '9876543210', address: 'Andheri, Mumbai', gst_number: '27ABCDE1234F1Z5' },
  { id: 's2', name: 'HealthLine Distributors', phone: '9123456780', address: 'Kalyan, Mumbai', gst_number: '27XYZAB5678G1Z2' }
];

// Mock in-memory purchases
let purchases = [
  {
    id: 'p1',
    supplier_id: 's1',
    supplier_name: 'MedSupply Co.',
    purchase_date: '2026-09-01',
    total_amount: 12500,
    status: 'pending',
    items: [
      { medicine_id: '1', medicine_name: 'Amoxicillin 500mg', batch_number: 'AMX-03', quantity: 100, price: 65 }
    ]
  },
  {
    id: 'p2',
    supplier_id: 's2',
    supplier_name: 'HealthLine Distributors',
    purchase_date: '2026-08-20',
    total_amount: 5850,
    status: 'received',
    items: [
      { medicine_id: '3', medicine_name: 'Insulin Glargine 100IU', batch_number: 'INS-05', quantity: 10, price: 450 }
    ]
  }
];
// Mock in-memory customers
let customers = [
  { id: 'c1', name: 'Walk-in Customer' },
  { id: 'c2', name: 'Sunita Patel' },
  { id: 'c3', name: 'Ramesh Iyer' }
];

// Mock in-memory sales (billing)
const _todayStr = new Date().toISOString().split('T')[0];
const _earlierThisMonth = new Date();
_earlierThisMonth.setDate(1);
const _earlierThisMonthStr = _earlierThisMonth.toISOString().split('T')[0];

let sales = [
  {
    id: 's1',
    invoice_number: 'INV-2026-0001',
    date: _todayStr,
    customer_id: 'c2',
    customer_name: 'Sunita Patel',
    total_amount: 1904,
    gst_amount: 204,
    items: [
      { medicine_name: 'Amoxicillin 500mg', batch_number: 'AMX-01', quantity: 20, price: 85 }
    ]
  },
  {
    id: 's2',
    invoice_number: 'INV-2026-0002',
    date: _todayStr,
    customer_id: 'c3',
    customer_name: 'Ramesh Iyer',
    total_amount: 1288,
    gst_amount: 138,
    items: [
      { medicine_name: 'Azithromycin 250mg', batch_number: 'AZT-99', quantity: 10, price: 115 }
    ]
  },
  {
    id: 's3',
    invoice_number: 'INV-2026-0003',
    date: _earlierThisMonthStr,
    customer_id: null,
    customer_name: 'Walk-in Customer',
    total_amount: 1638,
    gst_amount: 78,
    items: [
      { medicine_name: 'Insulin Glargine 100IU', batch_number: 'INS-04', quantity: 3, price: 520 }
    ]
  }
];
let salesInvoiceCounter = 3; // continue numbering from INV-2026-0004

// Simple auth guard: redirect to /login if no session user
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// Recalculate medicine totals and nearest expiry date
function recalculateMedicine(med) {
  med.total_quantity = med.batches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
  const futureBatches = med.batches
    .filter(b => b.expiry_date)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
  med.nearest_expiry = futureBatches.length > 0 ? futureBatches[0].expiry_date : null;
}

// Apply requireLogin to every route below this line
router.use(requireLogin);

// Shared dashboard render logic
function renderDashboard(req, res) {
  const pendingPurchasesCount = purchases.filter(p => p.status === 'pending').length;
  res.render('dashboard', {
    inventoryItemsCount: medicines.length,
    pendingPurchasesCount
  });
}

router.get('/', renderDashboard);
router.get('/dashboard', renderDashboard);

router.get('/inventory', (req, res) => {
  const search = req.query.search ? req.query.search.trim().toLowerCase() : '';
  let filtered = medicines;

  if (search) {
    filtered = medicines.filter(m =>
      m.name.toLowerCase().includes(search) ||
      m.category.toLowerCase().includes(search) ||
      m.unit.toLowerCase().includes(search)
    );
  }

  res.render('inventory/list', {
    medicines: filtered,
    search: req.query.search || ''
  });
});

router.get('/inventory/add', (req, res) => {
  res.render('inventory/add-medicine', { error: null });
});

router.post('/inventory/add', (req, res) => {
  const { name, category, gst_percent, unit } = req.body;

  if (!name || !category || !unit) {
    return res.status(400).render('inventory/add-medicine', {
      error: 'Please fill out all required fields.'
    });
  }

  medicines.unshift({
    id: Date.now().toString(),
    name: name.trim(),
    category: category.trim(),
    gst_percent: parseInt(gst_percent, 10) || 12,
    unit: unit.trim(),
    total_quantity: 0,
    nearest_expiry: null,
    batches: []
  });

  res.redirect('/inventory');
});

router.get('/inventory/:id/add-batch', (req, res) => {
  const medicine = medicines.find(m => String(m.id) === String(req.params.id));
  if (!medicine) return res.redirect('/inventory');

  res.render('inventory/add-batch', { medicine, error: null });
});

router.post('/inventory/:id/add-batch', (req, res) => {
  const medicine = medicines.find(m => String(m.id) === String(req.params.id));
  if (!medicine) return res.redirect('/inventory');

  const { batch_number, expiry_date, quantity, purchase_price, selling_price } = req.body;

  if (!batch_number || !expiry_date || !quantity || !purchase_price || !selling_price) {
    return res.status(400).render('inventory/add-batch', {
      medicine,
      error: 'All batch fields are required.'
    });
  }

  medicine.batches.push({
    id: 'b_' + Date.now(),
    batch_number: batch_number.trim(),
    expiry_date: expiry_date.trim(),
    quantity: parseInt(quantity, 10),
    purchase_price: parseFloat(purchase_price),
    selling_price: parseFloat(selling_price)
  });

  recalculateMedicine(medicine);
  res.redirect('/inventory');
});

// ---------- PURCHASE ROUTES ----------

// GET /purchase — supports ?supplier=&from=&to= filtering, and ?error= for delete failures
router.get('/purchase', (req, res) => {
  const { supplier, from, to, error } = req.query;
  let filtered = purchases;

  if (supplier) {
    const s = supplier.trim().toLowerCase();
    filtered = filtered.filter(p => p.supplier_name.toLowerCase().includes(s));
  }
  if (from) {
    filtered = filtered.filter(p => new Date(p.purchase_date) >= new Date(from));
  }
  if (to) {
    filtered = filtered.filter(p => new Date(p.purchase_date) <= new Date(to));
  }

  res.render('purchase/list', {
    purchases: filtered,
    filters: { supplier: supplier || '', from: from || '', to: to || '' },
    error: error || null
  });
});

router.get('/purchase/add', (req, res) => {
  res.render('purchase/add', { suppliers, medicines });
});

router.post('/purchase/add', (req, res) => {
  const { supplier_id, purchase_date, total_amount, items } = req.body;

  if (!supplier_id || !purchase_date || !items) {
    return res.status(400).render('purchase/add', {
      suppliers,
      medicines,
      error: 'Please fill out all required fields and add at least one item.'
    });
  }

  const supplier = suppliers.find(s => String(s.id) === String(supplier_id));

  const itemsArray = Object.values(items).map(item => {
    const medicine = medicines.find(m => String(m.id) === String(item.medicine_id));
    return {
      medicine_id: item.medicine_id,
      medicine_name: medicine ? medicine.name : 'Unknown',
      batch_number: item.batch_number,
      expiry_date: item.expiry_date,
      quantity: parseInt(item.quantity, 10) || 0,
      price: parseFloat(item.purchase_price) || 0,
      selling_price: parseFloat(item.selling_price) || 0
    };
  });

  purchases.unshift({
    id: 'p' + Date.now(),
    supplier_id,
    supplier_name: supplier ? supplier.name : 'Unknown',
    purchase_date,
    total_amount: parseFloat(total_amount) || 0,
    status: 'pending',
    items: itemsArray
  });

  itemsArray.forEach(item => {
    const medicine = medicines.find(m => String(m.id) === String(item.medicine_id));
    if (medicine) {
      medicine.batches.push({
        id: 'b_' + Date.now() + '_' + item.medicine_id,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        quantity: item.quantity,
        purchase_price: item.price,
        selling_price: item.selling_price
      });
      recalculateMedicine(medicine);
    }
  });

  res.redirect('/purchase');
});

router.get('/purchase/:id', (req, res) => {
  const purchase = purchases.find(p => String(p.id) === String(req.params.id));
  if (!purchase) return res.redirect('/purchase');

  res.render('purchase/detail', { purchase, items: purchase.items });
});

// POST /purchase/:id/delete — admin only, blocked if already received
router.post('/purchase/:id/delete', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/purchase?error=' + encodeURIComponent('Only admins can delete purchases.'));
  }

  const purchase = purchases.find(p => String(p.id) === String(req.params.id));
  if (!purchase) {
    return res.redirect('/purchase?error=' + encodeURIComponent('Purchase not found.'));
  }

  if (purchase.status === 'received') {
    return res.redirect('/purchase?error=' + encodeURIComponent('This purchase has already been received into stock and cannot be deleted.'));
  }

  purchases = purchases.filter(p => String(p.id) !== String(req.params.id));
  res.redirect('/purchase');
});
// ---------- BILLING ROUTES ----------

router.get('/billing/create', (req, res) => {
  res.render('billing/create', { medicines, customers });
});

router.get('/billing/batch-lookup/:medicineId', (req, res) => {
  const medicine = medicines.find(m => String(m.id) === String(req.params.medicineId));
  if (!medicine) return res.json([]);

  const availableBatches = medicine.batches
    .filter(b => b.quantity > 0)
    .map(b => ({
      id: b.id,
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      price: b.selling_price,
      quantity_available: b.quantity
    }));

  res.json(availableBatches);
});

router.post('/billing/create', (req, res) => {
  const { customer_id, items } = req.body;

  if (!items) {
    return res.status(400).render('billing/create', {
      medicines,
      customers,
      error: 'Please add at least one item.'
    });
  }

  const itemsArray = Object.values(items);
  let subtotal = 0;
  let gstAmount = 0;
  const lineItems = [];

  // Validate everything before mutating any stock
  for (const item of itemsArray) {
    const medicine = medicines.find(m => String(m.id) === String(item.medicine_id));
    if (!medicine) {
      return res.status(400).render('billing/create', { medicines, customers, error: 'Invalid medicine selected.' });
    }
    const batch = medicine.batches.find(b => String(b.id) === String(item.batch_id));
    if (!batch) {
      return res.status(400).render('billing/create', { medicines, customers, error: 'Invalid batch selected.' });
    }
    const quantity = parseInt(item.quantity, 10) || 0;
    if (quantity < 1 || quantity > batch.quantity) {
      return res.status(400).render('billing/create', {
        medicines,
        customers,
        error: `Requested quantity for ${medicine.name} exceeds available stock (${batch.quantity}).`
      });
    }

    const price = batch.selling_price;
    const lineTotal = price * quantity;
    subtotal += lineTotal;
    gstAmount += lineTotal * ((medicine.gst_percent || 0) / 100);

    lineItems.push({ medicine, batch, quantity, price });
  }

  // All valid — now actually decrement stock
  lineItems.forEach(({ medicine, batch, quantity }) => {
    batch.quantity -= quantity;
    recalculateMedicine(medicine);
  });

  const customer = customers.find(c => String(c.id) === String(customer_id));

  const sale = {
    id: 's' + Date.now(),
    invoice_number: generateInvoiceNumber(),
    date: new Date().toISOString().split('T')[0],
    customer_id: customer_id || null,
    customer_name: customer ? customer.name : 'Walk-in Customer',
    total_amount: subtotal + gstAmount,
    gst_amount: gstAmount,
    items: lineItems.map(({ medicine, batch, quantity, price }) => ({
      medicine_name: medicine.name,
      batch_number: batch.batch_number,
      quantity,
      price
    }))
  };

  sales.unshift(sale);
  res.redirect('/billing/' + sale.id);
});

router.get('/billing/history', (req, res) => {
  res.render('billing/history', { sales });
});

router.get('/billing/:id', (req, res) => {
  const sale = sales.find(s => String(s.id) === String(req.params.id));
  if (!sale) return res.redirect('/billing/history');

  res.render('billing/invoice', { sale, items: sale.items });
});


// ---------- SUPPLIER ROUTES ----------

router.get('/suppliers/add', (req, res) => {
  res.render('suppliers/add', { error: null });
});

router.post('/suppliers/add', (req, res) => {
  const { name, phone, address, gst_number } = req.body;

  if (!name || !phone) {
    return res.status(400).render('suppliers/add', {
      error: 'Name and phone are required.'
    });
  }

  suppliers.push({
    id: 's' + Date.now(),
    name: name.trim(),
    phone: phone.trim(),
    address: (address || '').trim(),
    gst_number: (gst_number || '').trim()
  });

  res.redirect('/purchase/add');
});

module.exports = router;
// ---------- REPORTS ROUTES ----------

router.get('/reports/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.slice(0, 7); // 'YYYY-MM'

  // TODO: replace with real sales data once billing writes to a `sales` store.
  res.render('reports/dashboard', {
    todaySales: 0,
    monthSales: 0,
    monthGst: 0,
    topMedicines: [],
    lowStockCount: medicines.filter(m => m.total_quantity < 20).length,
    nearExpiryCount: medicines.filter(m =>
      m.nearest_expiry && new Date(m.nearest_expiry) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    ).length
  });
});

module.exports = router;