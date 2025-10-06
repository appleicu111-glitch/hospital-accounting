let currentUser = null;
let patients = [];
let expenses = [];

// Initialize app
async function init() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            currentUser = await response.json();
            document.getElementById('currentUser').textContent = currentUser.username;
            loadData();
        } else {
            window.location.href = '/';
        }
    } catch (error) {
        window.location.href = '/';
    }
}

// Load all data
async function loadData() {
    await loadStats();
    await loadPatients();
    await loadExpenses();
    if (currentUser.role === 'admin') {
        await loadAuditLog();
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        document.getElementById('totalDeposits').textContent = `₹${stats.totalDeposits}`;
        document.getElementById('totalPatientExpenses').textContent = `₹${stats.totalPatientExpenses}`;
        document.getElementById('totalGeneralExpenses').textContent = `₹${stats.totalGeneralExpenses}`;
        document.getElementById('netBalance').textContent = `₹${stats.netBalance}`;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

async function loadPatients() {
    try {
        const response = await fetch('/api/patients');
        patients = await response.json();
        renderPatients();
    } catch (error) {
        console.error('Failed to load patients:', error);
    }
}

function renderPatients() {
    const tbody = document.querySelector('#patientsTable tbody');
    tbody.innerHTML = '';
    patients.forEach(patient => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${patient.name}</td>
            <td>${patient.type}</td>
            <td>${patient.admission_date}</td>
            <td>
                <button onclick="viewTransactions(${patient.id})">View Account</button>
                <button class="danger" onclick="deletePatient(${patient.id})">Delete</button>
            </td>
        `;
    });
}

// Tab functionality
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName).style.display = 'block';
    event.target.classList.add('active');
}

// Modal functions
function showModal(content) {
    document.getElementById('modalContent').innerHTML = content;
    document.getElementById('modalOverlay').style.display = 'block';
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
}

// Add patient form
function showAddPatientForm() {
    const form = `
        <h3>Add New Patient</h3>
        <form onsubmit="addPatient(event)">
            <input type="text" placeholder="Patient Name" required name="name">
            <select name="type" required>
                <option value="">Select Type</option>
                <option value="Ambulance">Ambulance</option>
                <option value="Self">Self</option>
                <option value="Walk-in">Walk-in</option>
                <option value="Reference">Reference</option>
                <option value="Other">Other</option>
            </select>
            <input type="date" name="admission_date" required>
            <button type="submit">Add Patient</button>
        </form>
    `;
    showModal(form);
}

async function addPatient(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            closeModal();
            loadPatients();
            loadStats();
        }
    } catch (error) {
        console.error('Failed to add patient:', error);
    }
}

async function deletePatient(patientId) {
    if (confirm('Are you sure you want to delete this patient and all their records?')) {
        try {
            const response = await fetch(`/api/patients/${patientId}`, { method: 'DELETE' });
            if (response.ok) {
                loadPatients();
                loadStats();
            }
        } catch (error) {
            console.error('Failed to delete patient:', error);
        }
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        window.location.href = '/';
    }
}

// Basic stubs for unimplemented features
async function loadExpenses() { /* TODO: Fill for Expenses tab */ }
async function loadAuditLog() { /* TODO: Fill for Audit Log tab */ }
function viewTransactions(patientId) { /* TODO: Fill for viewing patient transactions */ }
function showAddExpenseForm() { /* TODO: Fill for adding a new expense */ }

// Initialize when page loads
if (window.location.pathname.endsWith('dashboard.html')) {
    document.addEventListener('DOMContentLoaded', init);
}
