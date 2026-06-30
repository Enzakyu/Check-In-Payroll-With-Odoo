// server.js
// Backend API Gateway: Menghubungkan langsung Portal Web ke Database Odoo ERP (Tanpa Database Lokal)

const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ==================== KONFIGURASI KREDENSIAL ODOO ====================
// Silakan isi dengan data asli Odoo Anda di bawah ini:
const ODOO_CONFIG = {
  url: 'https://nn-supplies.odoo.com',     // URL Odoo Anda
  db: 'nn_supplies_prod',                 // Nama database Odoo
  username: 'admin@nnsupplies.com',        // Email/Username login Odoo
  apiKey: 'YOUR_REAL_ODOO_API_KEY'         // API Key Odoo (Settings -> Users -> API Keys)
};
// =====================================================================

// Helper: Memanggil Odoo JSON-RPC API secara native (Tanpa package eksternal)
function callOdoo(service, method, args) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(ODOO_CONFIG.url);
    const postData = JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1000)
    });

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: '/jsonrpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsedBody = JSON.parse(body);
          if (parsedBody.error) {
            reject(new Error(parsedBody.error.data.message || parsedBody.error.message));
          } else {
            resolve(parsedBody.result);
          }
        } catch (e) {
          reject(new Error('Respon Odoo bukan JSON: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

// Middleware helper untuk melakukan autentikasi otomatis ke Odoo & mendapatkan UID
async function getOdooUid() {
  return await callOdoo('common', 'login', [
    ODOO_CONFIG.db,
    ODOO_CONFIG.username,
    ODOO_CONFIG.apiKey
  ]);
}

// ==================== ENDPOINT API GATEWAY PORTAL ====================

// 1. GET ALL EMPLOYEES FROM ODOO (Mengambil dari hr.employee)
app.get('/api/employees', async (req, res) => {
  try {
    const uid = await getOdooUid();
    if (!uid) return res.status(401).json({ error: 'Kredensial Odoo salah atau tidak sah.' });

    // Membaca model hr.employee Odoo
    const odooEmployees = await callOdoo('object', 'execute_kw', [
      ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
      'hr.employee', 'search_read',
      [[['active', '=', true]]], // Filter: Karyawan aktif
      { fields: ['id', 'name', 'job_title', 'work_email', 'image_128'] } // Kolom yang diambil
    ]);

    // Format data agar sesuai kebutuhan frontend portal
    const formattedEmployees = odooEmployees.map(emp => ({
      id: `EMP${emp.id.toString().padStart(3, '0')}`, // Format ID lokal
      name: emp.name,
      role: emp.job_title || 'Staf Operasional',
      hourlyRate: 35000, // Tarif default (di Odoo bisa dipetakan ke hr.contract jika ada)
      allowance: 800000, // Tunjangan default
      deduction: 150000, // Potongan default
      odooId: emp.id,
      avatar: emp.image_128 ? `data:image/png;base64,${emp.image_128}` : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'
    }));

    res.json(formattedEmployees);
  } catch (error) {
    console.error('Error fetching employees from Odoo:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2a. GET ALL ATTENDANCE LOGS FROM ODOO (Mengambil seluruh absensi untuk Admin Dashboard)
app.get('/api/attendance', async (req, res) => {
  try {
    const uid = await getOdooUid();
    const logs = await callOdoo('object', 'execute_kw', [
      ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
      'hr.attendance', 'search_read',
      [[]],
      { 
        fields: ['id', 'employee_id', 'check_in', 'check_out'],
        order: 'check_in DESC',
        limit: 100
      }
    ]);

    const formattedLogs = logs.map(log => {
      const checkInLocal = new Date(log.check_in + ' UTC');
      const checkOutLocal = log.check_out ? new Date(log.check_out + ' UTC') : null;
      const empOdooId = log.employee_id ? log.employee_id[0] : 0;

      return {
        id: `ATT${log.id}`,
        employeeId: `EMP${empOdooId.toString().padStart(3, '0')}`,
        date: checkInLocal.toISOString().split('T')[0],
        checkIn: checkInLocal.toTimeString().split(' ')[0],
        checkOut: checkOutLocal ? checkOutLocal.toTimeString().split(' ')[0] : null,
        location: 'Odoo Database',
        notes: 'Real-time Odoo Sync'
      };
    });

    res.json(formattedLogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. GET ATTENDANCE LOGS FOR AN EMPLOYEE FROM ODOO (Mengambil dari hr.attendance)
app.get('/api/attendance/:odooEmployeeId', async (req, res) => {
  try {
    const uid = await getOdooUid();
    const odooEmployeeId = parseInt(req.params.odooEmployeeId);

    const logs = await callOdoo('object', 'execute_kw', [
      ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
      'hr.attendance', 'search_read',
      [[['employee_id', '=', odooEmployeeId]]],
      { 
        fields: ['id', 'check_in', 'check_out'],
        order: 'check_in DESC'
      }
    ]);

    // Ubah format tanggal Odoo UTC ke Waktu Lokal (WIB) untuk frontend
    const formattedLogs = logs.map(log => {
      const checkInLocal = new Date(log.check_in + ' UTC');
      const checkOutLocal = log.check_out ? new Date(log.check_out + ' UTC') : null;

      return {
        id: `ATT${log.id}`,
        employeeId: `EMP${odooEmployeeId.toString().padStart(3, '0')}`,
        date: checkInLocal.toISOString().split('T')[0],
        checkIn: checkInLocal.toTimeString().split(' ')[0],
        checkOut: checkOutLocal ? checkOutLocal.toTimeString().split(' ')[0] : null,
        location: 'Odoo Database',
        notes: 'Real-time Odoo Sync'
      };
    });

    res.json(formattedLogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. POST CLOCK IN / CHECK-IN DIRECT TO ODOO
app.post('/api/attendance/checkin', async (req, res) => {
  const { odooEmployeeId } = req.body;

  try {
    const uid = await getOdooUid();
    
    // Odoo menyimpan jam dalam format UTC
    const nowUtc = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const recordId = await callOdoo('object', 'execute_kw', [
      ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
      'hr.attendance', 'create',
      [{
        employee_id: parseInt(odooEmployeeId),
        check_in: nowUtc
      }]
    ]);

    res.json({ success: true, odooRecordId: recordId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. POST CLOCK OUT / CHECK-OUT DIRECT TO ODOO
app.post('/api/attendance/checkout', async (req, res) => {
  const { odooEmployeeId } = req.body;

  try {
    const uid = await getOdooUid();

    // A. Cari record attendance yang masih terbuka (belum checkout) untuk karyawan ini
    const openRecords = await callOdoo('object', 'execute_kw', [
      ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
      'hr.attendance', 'search',
      [[['employee_id', '=', parseInt(odooEmployeeId)], ['check_out', '=', false]]]
    ]);

    if (openRecords.length === 0) {
      return res.status(404).json({ error: 'Tidak ditemukan log check-in aktif untuk karyawan ini di Odoo.' });
    }

    const activeRecordId = openRecords[0];
    const nowUtc = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // B. Update record tersebut dengan waktu check_out saat ini
    const success = await callOdoo('object', 'execute_kw', [
      ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
      'hr.attendance', 'write',
      [[activeRecordId], { check_out: nowUtc }]
    ]);

    res.json({ success: success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. POST MANUAL LOG ADJUSTMENT DIRECT TO ODOO
app.post('/api/attendance/manual', async (req, res) => {
  const { odooEmployeeId, checkInTime, checkOutTime } = req.body;

  try {
    const uid = await getOdooUid();

    const recordId = await callOdoo('object', 'execute_kw', [
      ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
      'hr.attendance', 'create',
      [{
        employee_id: parseInt(odooEmployeeId),
        check_in: checkInTime,
        check_out: checkOutTime
      }]
    ]);

    res.json({ success: true, odooRecordId: recordId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. DELETE ATTENDANCE LOG DIRECT FROM ODOO
app.delete('/api/attendance/:odooAttendanceId', async (req, res) => {
  try {
    const uid = await getOdooUid();
    const attendanceId = parseInt(req.params.odooAttendanceId.replace('ATT', ''));

    const success = await callOdoo('object', 'execute_kw', [
      ODOO_CONFIG.db, uid, ODOO_CONFIG.apiKey,
      'hr.attendance', 'unlink',
      [[attendanceId]]
    ]);

    res.json({ success: success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Jalankan server gateway
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`Gateway API Odoo Portal N&N Supplies berjalan.`);
  console.log(`Akses Server: http://localhost:${PORT}`);
  console.log(`Status: Terhubung langsung ke Odoo DB [${ODOO_CONFIG.db}]`);
  console.log(`====================================================`);
});
