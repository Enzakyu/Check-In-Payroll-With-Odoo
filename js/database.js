const xmlrpc = require('xmlrpc');

// 1. Konfigurasi Koneksi ke Home Server Anda
// Jika menggunakan HTTP biasa (tanpa SSL), gunakan createClient
// Jika sudah menggunakan HTTPS (Cloudflare/Let's Encrypt), gunakan createSecureClient
const ODOO_URL = 'http://IP_PUBLIK_ATAU_DOMAIN_TUNNEL_ANDA:8069'; 
const DB_NAME = 'nama_database_odoo_anda';
const USERNAME = 'email_login_odoo_anda';
const API_KEY = 'api_key_odoo_anda'; // Ambil dari profil Odoo Anda

// 2. Buat Client untuk Autentikasi
const commonClient = xmlrpc.createClient(`${ODOO_URL}/xmlrpc/2/common`);

function lakukanCheckIn(employeeIdOdoo) {
    // Langkah A: Mengetuk pintu Odoo untuk mendapatkan User ID (UID)
    commonClient.methodCall('authenticate', [DB_NAME, USERNAME, API_KEY, {}], (error, uid) => {
        if (error || !uid) {
            console.error('Gagal terhubung ke Odoo Home Server:', error);
            return;
        }
        console.log(`Koneksi Sukses! Terautentikasi dengan UID: ${uid}`);

        // Langkah B: Siapkan Client untuk manipulasi data/object
        const objectClient = xmlrpc.createClient(`${ODOO_URL}/xmlrpc/2/object`);

        // Odoo mendeteksi waktu dalam format UTC (YYYY-MM-DD HH:MM:SS)
        // Kode di bawah ini mengonversi waktu lokal server Anda ke format UTC Odoo
        const waktuSekarangUTC = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // Data yang akan dikirim ke modul hr.attendance Odoo
        const dataCheckIn = {
            'employee_id': employeeIdOdoo, // ID Karyawan di Odoo
            'check_in': waktuSekarangUTC   // Waktu Check-in
        };

        // Langkah C: Eksekusi perintah 'create' ke model 'hr.attendance'
        objectClient.methodCall(
            'execute_kw', 
            [DB_NAME, uid, API_KEY, 'hr.attendance', 'create', [dataCheckIn]], 
            (err, recordId) => {
                if (err) {
                    console.error('Gagal mencatat check-in ke Odoo:', err);
                } else {
                    console.log(`[SUKSES] Check-in berhasil dicatat di Odoo dengan ID Record: ${recordId}`);
                }
            }
        );
    });
}

// Contoh Penggunaan: Seseorang dengan ID Odoo 5 melakukan check-in di website Anda
lakukanCheckIn(5);