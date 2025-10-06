const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'hospital-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
}

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    
    if (user && bcrypt.compareSync(password, user.password)) {
      req.session.user = { id: user.id, username: user.username, role: user.role };
      res.json({ success: true, user: req.session.user });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get('/api/user', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Patients API
app.get('/api/patients', requireAuth, (req, res) => {
  db.all('SELECT * FROM patients ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/patients', requireAuth, (req, res) => {
  const { name, type, admission_date } = req.body;
  const created_by = req.session.user.username;
  
  db.run('INSERT INTO patients (name, type, admission_date, created_by) VALUES (?, ?, ?, ?)',
    [name, type, admission_date, created_by], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    // Log the action
    db.run('INSERT INTO audit_log (user, action, table_name, record_id, new_values) VALUES (?, ?, ?, ?, ?)',
      [created_by, 'INSERT', 'patients', this.lastID, JSON.stringify({ name, type, admission_date })]);
    
    res.json({ id: this.lastID, name, type, admission_date, created_by });
  });
});

app.delete('/api/patients/:id', requireAuth, (req, res) => {
  const patientId = req.params.id;
  const user = req.session.user.username;
  
  // Get patient data for logging
  db.get('SELECT * FROM patients WHERE id = ?', [patientId], (err, patient) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Delete patient transactions first
    db.run('DELETE FROM patient_transactions WHERE patient_id = ?', [patientId]);
    
    // Delete patient
    db.run('DELETE FROM patients WHERE id = ?', [patientId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Log the action
      db.run('INSERT INTO audit_log (user, action, table_name, record_id, old_values) VALUES (?, ?, ?, ?, ?)',
        [user, 'DELETE', 'patients', patientId, JSON.stringify(patient)]);
      
      res.json({ success: true });
    });
  });
});

// Patient Transactions API
app.get('/api/transactions/:patientId', requireAuth, (req, res) => {
  db.all('SELECT * FROM patient_transactions WHERE patient_id = ? ORDER BY created_at DESC', 
    [req.params.patientId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/transactions', requireAuth, (req, res) => {
  const { patient_id, date, description, amount, is_deposit, is_ambulance } = req.body;
  const created_by = req.session.user.username;
  
  db.run('INSERT INTO patient_transactions (patient_id, date, description, amount, is_deposit, is_ambulance, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [patient_id, date, description, amount, is_deposit, is_ambulance, created_by], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    // Log the action
    db.run('INSERT INTO audit_log (user, action, table_name, record_id, new_values) VALUES (?, ?, ?, ?, ?)',
      [created_by, 'INSERT', 'patient_transactions', this.lastID, JSON.stringify(req.body)]);
    
    res.json({ id: this.lastID, ...req.body, created_by });
  });
});

// General Expenses API
app.get('/api/expenses', requireAuth, (req, res) => {
  db.all('SELECT * FROM general_expenses ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/expenses', requireAuth, (req, res) => {
  const { date, category, description, patient_name, amount } = req.body;
  const created_by = req.session.user.username;
  
  db.run('INSERT INTO general_expenses (date, category, description, patient_name, amount, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [date, category, description, patient_name, amount, created_by], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    // Log the action
    db.run('INSERT INTO audit_log (user, action, table_name, record_id, new_values) VALUES (?, ?, ?, ?, ?)',
      [created_by, 'INSERT', 'general_expenses', this.lastID, JSON.stringify(req.body)]);
    
    res.json({ id: this.lastID, ...req.body, created_by });
  });
});

// Audit Log API
app.get('/api/audit', requireAuth, (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  db.all('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Dashboard stats
app.get('/api/stats', requireAuth, (req, res) => {
  const stats = {};
  
  // Get total deposits
  db.get('SELECT SUM(amount) as total FROM patient_transactions WHERE is_deposit = 1', (err, result) => {
    stats.totalDeposits = result.total || 0;
    
    // Get total patient expenses
    db.get('SELECT SUM(amount) as total FROM patient_transactions WHERE is_deposit = 0 AND is_ambulance = 0', (err, result) => {
      stats.totalPatientExpenses = result.total || 0;
      
      // Get total general expenses
      db.get('SELECT SUM(amount) as total FROM general_expenses', (err, result) => {
        stats.totalGeneralExpenses = result.total || 0;
        stats.netBalance = stats.totalDeposits - stats.totalPatientExpenses - stats.totalGeneralExpenses;
        
        res.json(stats);
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
