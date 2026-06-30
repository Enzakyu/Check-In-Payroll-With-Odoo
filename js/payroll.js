// js/payroll.js

const PayrollModule = {
  activeEmployeeFilter: "all",
  selectedPayslipData: null,

  async init() {
    await this.refreshDashboard();
    this.setupEventListeners();
  },

  async refreshDashboard() {
    await Database.loadAllAttendance();
    this.renderStats();
    this.renderAttendanceTable();
    this.renderPayrollTable();
    this.renderEmployeeManager();
  },

  renderStats() {
    const employees = Database.getEmployees();
    const logs = Database.getAttendance();
    const todayStr = new Date().toISOString().split('T')[0];

    // Total employees
    document.getElementById("statTotalEmployees").textContent = employees.length;

    // Present today
    const presentToday = new Set(logs.filter(log => log.date === todayStr).map(log => log.employeeId));
    document.getElementById("statPresentToday").textContent = presentToday.size;

    // Calculate total payroll for current logs + base monthly allowances
    let totalPayrollEst = 0;
    let totalHoursLogged = 0;

    employees.forEach(emp => {
      const empLogs = logs.filter(log => log.employeeId === emp.id);
      let basePay = 0;
      
      empLogs.forEach(log => {
        if (log.checkOut) {
          const hours = parseFloat(CheckinModule.calculateDuration(log.checkIn, log.checkOut));
          totalHoursLogged += hours;
          
          // Regular vs Overtime logic (Overtime is > 8 hrs in single day, paid at 1.5x)
          if (hours > 8) {
            const regularHours = 8;
            const otHours = hours - 8;
            basePay += (regularHours * emp.hourlyRate) + (otHours * emp.hourlyRate * 1.5);
          } else {
            basePay += hours * emp.hourlyRate;
          }
        }
      });

      // Net estimate = Base hourly earnings + base allowance - base deduction
      // We assume allowances are periodic, we scale or add them for visualization
      totalPayrollEst += basePay + emp.allowance - emp.deduction;
    });

    document.getElementById("statTotalHours").textContent = totalHoursLogged.toFixed(1) + " hrs";
    document.getElementById("statPayrollEst").textContent = "Rp " + totalPayrollEst.toLocaleString('id-ID');
  },

  renderAttendanceTable() {
    const tableBody = document.getElementById("attendanceTableBody");
    const filterSelect = document.getElementById("adminEmployeeFilter");
    if (!tableBody) return;

    // Populate filter select if empty
    if (filterSelect && filterSelect.options.length <= 1) {
      const employees = Database.getEmployees();
      filterSelect.innerHTML = `<option value="all">Semua Karyawan</option>` + 
        employees.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');
    }

    const logs = Database.getAttendance();
    const employees = Database.getEmployees();
    
    // Sort logs by date desc
    let sortedLogs = [...logs].sort((a, b) => new Date(b.date + 'T' + b.checkIn) - new Date(a.date + 'T' + a.checkIn));

    // Apply Filter
    if (this.activeEmployeeFilter !== "all") {
      sortedLogs = sortedLogs.filter(log => log.employeeId === this.activeEmployeeFilter);
    }

    if (sortedLogs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Tidak ada log kehadiran ditemukan.</td></tr>`;
      return;
    }

    tableBody.innerHTML = sortedLogs.map(log => {
      const emp = employees.find(e => e.id === log.employeeId) || { name: "Unknown", role: "Unknown" };
      const duration = log.checkOut ? CheckinModule.calculateDuration(log.checkIn, log.checkOut) + " jam" : `<span class="badge badge-warning">Aktif</span>`;
      
      return `
        <tr>
          <td><strong>${emp.name}</strong><br><small style="color: var(--text-muted);">${emp.id}</small></td>
          <td>${CheckinModule.formatDateIndo(log.date)}</td>
          <td>${log.checkIn}</td>
          <td>${log.checkOut || '-'}</td>
          <td>${duration}</td>
          <td>
            <div class="flex-between gap-1" style="justify-content: flex-start;">
              <button class="btn btn-secondary btn-icon" onclick="PayrollModule.openEditLogModal('${log.id}')" title="Edit Log"><i class="fa-solid fa-pen-to-square" style="font-size: 0.8rem;"></i></button>
              <button class="btn btn-danger btn-icon" onclick="PayrollModule.deleteLog('${log.id}')" style="padding: 0.5rem;" title="Delete Log"><i class="fa-solid fa-trash-can" style="font-size: 0.8rem;"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderPayrollTable() {
    const tableBody = document.getElementById("payrollTableBody");
    if (!tableBody) return;

    const employees = Database.getEmployees();
    const logs = Database.getAttendance();

    tableBody.innerHTML = employees.map(emp => {
      const empLogs = logs.filter(log => log.employeeId === emp.id);
      
      let totalHours = 0;
      let regularHours = 0;
      let otHours = 0;
      let totalBasePay = 0;

      empLogs.forEach(log => {
        if (log.checkOut) {
          const hours = parseFloat(CheckinModule.calculateDuration(log.checkIn, log.checkOut));
          totalHours += hours;
          
          if (hours > 8) {
            regularHours += 8;
            otHours += (hours - 8);
            totalBasePay += (8 * emp.hourlyRate) + ((hours - 8) * emp.hourlyRate * 1.5);
          } else {
            regularHours += hours;
            totalBasePay += hours * emp.hourlyRate;
          }
        }
      });

      const netPay = totalBasePay + emp.allowance - emp.deduction;

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <img src="${emp.avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
              <div>
                <strong>${emp.name}</strong><br>
                <small style="color: var(--text-muted);">${emp.role}</small>
              </div>
            </div>
          </td>
          <td>${totalHours.toFixed(1)} jam</td>
          <td>Rp ${totalBasePay.toLocaleString('id-ID')}</td>
          <td>Rp ${emp.allowance.toLocaleString('id-ID')}</td>
          <td>Rp ${emp.deduction.toLocaleString('id-ID')}</td>
          <td><strong style="color: var(--primary);">Rp ${netPay.toLocaleString('id-ID')}</strong></td>
          <td>
            <button class="btn btn-primary btn-icon" onclick="PayrollModule.generatePayslip('${emp.id}')" title="Buat Slip Gaji">
              <i class="fa-solid fa-file-invoice-dollar"></i> Slip Gaji
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderEmployeeManager() {
    const listEl = document.getElementById("adminEmployeeList");
    if (!listEl) return;

    const employees = Database.getEmployees();

    listEl.innerHTML = employees.map(emp => `
      <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; padding: 1rem;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <img src="${emp.avatar}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover;">
          <div>
            <h4 style="font-size: 0.95rem;">${emp.name}</h4>
            <p style="font-size: 0.75rem; color: var(--text-secondary);">${emp.role} (${emp.id})</p>
            <p style="font-size: 0.7rem; color: var(--primary); margin-top: 2px;">Tarif: Rp ${emp.hourlyRate.toLocaleString('id-ID')}/jam | Odoo ID: ${emp.odooId || 'Unmapped'}</p>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary btn-icon" onclick="PayrollModule.openEditEmployeeModal('${emp.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn btn-danger btn-icon" onclick="PayrollModule.deleteEmployee('${emp.id}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `).join('');
  },

  setupEventListeners() {
    const filterSelect = document.getElementById("adminEmployeeFilter");
    if (filterSelect) {
      filterSelect.addEventListener("change", (e) => {
        this.activeEmployeeFilter = e.target.value;
        this.renderAttendanceTable();
      });
    }

    // Modal submit forms
    const employeeForm = document.getElementById("employeeForm");
    if (employeeForm) {
      employeeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const id = document.getElementById("empFormId").value;
        const name = document.getElementById("empFormName").value;
        const role = document.getElementById("empFormRole").value;
        const hourlyRate = parseInt(document.getElementById("empFormRate").value) || 0;
        const allowance = parseInt(document.getElementById("empFormAllowance").value) || 0;
        const deduction = parseInt(document.getElementById("empFormDeduction").value) || 0;
        const odooId = parseInt(document.getElementById("empFormOdooId").value) || null;
        
        let existing = Database.getEmployee(id);
        const avatar = existing ? existing.avatar : "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"; // standard default avatar placeholder

        const employeeObj = {
          id, name, role, hourlyRate, allowance, deduction, odooId, avatar
        };

        Database.saveEmployee(employeeObj);
        this.closeModal("employeeModal");
        this.refreshDashboard();
        CheckinModule.renderEmployeeSelector();
        CheckinModule.showNotification("Success", "Data karyawan berhasil disimpan!", "success");
      });
    }

    const logForm = document.getElementById("logForm");
    if (logForm) {
      logForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const id = document.getElementById("logFormId").value;
        const employeeId = document.getElementById("logFormEmpId").value;
        const date = document.getElementById("logFormDate").value;
        const checkIn = document.getElementById("logFormCheckIn").value;
        const checkOut = document.getElementById("logFormCheckOut").value || null;
        const location = document.getElementById("logFormLocation").value;
        const notes = document.getElementById("logFormNotes").value;

        const logObj = {
          id, employeeId, date, checkIn, checkOut, location, notes
        };

        if (id.startsWith("NEW")) {
          logObj.id = "ATT" + Date.now().toString().slice(-6);
          Database.addAttendance(logObj);
        } else {
          Database.updateAttendance(logObj);
        }

        this.closeModal("logModal");
        this.refreshDashboard();
        CheckinModule.showNotification("Success", "Log kehadiran berhasil diperbarui!", "success");
      });
    }
  },

  openAddEmployeeModal() {
    document.getElementById("empModalTitle").textContent = "Tambah Karyawan Baru";
    document.getElementById("empFormId").value = "EMP" + (Database.getEmployees().length + 1).toString().padStart(3, '0');
    document.getElementById("empFormId").readOnly = false;
    document.getElementById("empFormName").value = "";
    document.getElementById("empFormRole").value = "";
    document.getElementById("empFormRate").value = "25000";
    document.getElementById("empFormAllowance").value = "0";
    document.getElementById("empFormDeduction").value = "0";
    document.getElementById("empFormOdooId").value = "";
    
    this.openModal("employeeModal");
  },

  openEditEmployeeModal(id) {
    const emp = Database.getEmployee(id);
    if (!emp) return;

    document.getElementById("empModalTitle").textContent = "Edit Karyawan";
    document.getElementById("empFormId").value = emp.id;
    document.getElementById("empFormId").readOnly = true;
    document.getElementById("empFormName").value = emp.name;
    document.getElementById("empFormRole").value = emp.role;
    document.getElementById("empFormRate").value = emp.hourlyRate;
    document.getElementById("empFormAllowance").value = emp.allowance;
    document.getElementById("empFormDeduction").value = emp.deduction;
    document.getElementById("empFormOdooId").value = emp.odooId || "";

    this.openModal("employeeModal");
  },

  deleteEmployee(id) {
    if (confirm("Apakah Anda yakin ingin menghapus karyawan ini beserta semua riwayat kehadirannya?")) {
      Database.deleteEmployee(id);
      this.refreshDashboard();
      CheckinModule.renderEmployeeSelector();
      CheckinModule.showNotification("Deleted", "Data karyawan berhasil dihapus.", "danger");
    }
  },

  openAddLogModal() {
    const employees = Database.getEmployees();
    if (employees.length === 0) {
      alert("Silakan tambah karyawan terlebih dahulu.");
      return;
    }

    document.getElementById("logModalTitle").textContent = "Tambah Log Kehadiran Manual";
    document.getElementById("logFormId").value = "NEW" + Date.now();
    
    const empSelect = document.getElementById("logFormEmpId");
    empSelect.innerHTML = employees.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');
    empSelect.disabled = false;

    document.getElementById("logFormDate").value = new Date().toISOString().split('T')[0];
    document.getElementById("logFormCheckIn").value = "08:00:00";
    document.getElementById("logFormCheckOut").value = "17:00:00";
    document.getElementById("logFormLocation").value = "N&N Supplies HQ (Within Radius)";
    document.getElementById("logFormNotes").value = "Manual Entry";

    this.openModal("logModal");
  },

  openEditLogModal(id) {
    const logs = Database.getAttendance();
    const log = logs.find(l => l.id === id);
    if (!log) return;

    const employees = Database.getEmployees();
    const emp = employees.find(e => e.id === log.employeeId);

    document.getElementById("logModalTitle").textContent = "Edit Log Kehadiran";
    document.getElementById("logFormId").value = log.id;
    
    const empSelect = document.getElementById("logFormEmpId");
    empSelect.innerHTML = `<option value="${log.employeeId}">${emp ? emp.name : 'Unknown'}</option>`;
    empSelect.disabled = true;

    document.getElementById("logFormDate").value = log.date;
    document.getElementById("logFormCheckIn").value = log.checkIn;
    document.getElementById("logFormCheckOut").value = log.checkOut || "";
    document.getElementById("logFormLocation").value = log.location;
    document.getElementById("logFormNotes").value = log.notes || "";

    this.openModal("logModal");
  },

  deleteLog(id) {
    if (confirm("Hapus log kehadiran ini?")) {
      Database.deleteAttendance(id);
      this.refreshDashboard();
      CheckinModule.showNotification("Deleted", "Log kehadiran berhasil dihapus.", "danger");
    }
  },

  generatePayslip(employeeId) {
    const emp = Database.getEmployee(employeeId);
    const logs = Database.getAttendanceForEmployee(employeeId);
    
    let totalHours = 0;
    let regularHours = 0;
    let otHours = 0;
    let baseEarnings = 0;
    let otEarnings = 0;

    logs.forEach(log => {
      if (log.checkOut) {
        const hours = parseFloat(CheckinModule.calculateDuration(log.checkIn, log.checkOut));
        totalHours += hours;
        
        if (hours > 8) {
          regularHours += 8;
          const ot = hours - 8;
          otHours += ot;
          baseEarnings += 8 * emp.hourlyRate;
          otEarnings += ot * emp.hourlyRate * 1.5;
        } else {
          regularHours += hours;
          baseEarnings += hours * emp.hourlyRate;
        }
      }
    });

    const allowance = emp.allowance;
    const deduction = emp.deduction;
    const grossSalary = baseEarnings + otEarnings + allowance;
    const netSalary = grossSalary - deduction;

    this.selectedPayslipData = {
      employee: emp,
      totalHours,
      regularHours,
      otHours,
      baseEarnings,
      otEarnings,
      allowance,
      deduction,
      netSalary
    };

    // Render inside Payslip modal
    const payslipEl = document.getElementById("payslipRenderArea");
    if (payslipEl) {
      const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      const currentMonthYear = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      
      payslipEl.innerHTML = `
        <div class="payslip-container">
          <div class="payslip-header">
            <div class="payslip-company">
              <h3>N&N SUPPLIES LTD.</h3>
              <p>Warehouse HQ, Jl. Logistik No. 44, Jakarta</p>
              <p>Email: finance@nnsupplies.com</p>
            </div>
            <div class="payslip-title" style="text-align: right;">
              <h2>SLIP GAJI</h2>
              <p style="font-weight: 600; color: #64748b;">Periode: ${currentMonthYear}</p>
            </div>
          </div>
          
          <div class="payslip-meta">
            <div>
              <div class="payslip-meta-block">
                <h4>NAMA KARYAWAN</h4>
                <p>${emp.name}</p>
              </div>
              <div class="payslip-meta-block" style="margin-top: 1rem;">
                <h4>JABATAN / DIVISI</h4>
                <p>${emp.role}</p>
              </div>
            </div>
            <div style="text-align: right;">
              <div class="payslip-meta-block">
                <h4>ID KARYAWAN</h4>
                <p>${emp.id}</p>
              </div>
              <div class="payslip-meta-block" style="margin-top: 1rem;">
                <h4>ODOO PARTNER ID</h4>
                <p>#${emp.odooId || 'Belum Terhubung'}</p>
              </div>
            </div>
          </div>
          
          <table class="payslip-table">
            <thead>
              <tr>
                <th>Deskripsi Komponen</th>
                <th>Rincian Waktu / Nilai</th>
                <th style="text-align: right;">Jumlah (IDR)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Gaji Pokok Terhitung (Jam Kerja Reguler)</td>
                <td>${regularHours.toFixed(1)} jam @ Rp ${emp.hourlyRate.toLocaleString('id-ID')}</td>
                <td style="text-align: right;">Rp ${baseEarnings.toLocaleString('id-ID')}</td>
              </tr>
              <tr>
                <td>Lembur / Overtime (1.5x)</td>
                <td>${otHours.toFixed(1)} jam @ Rp ${(emp.hourlyRate * 1.5).toLocaleString('id-ID')}</td>
                <td style="text-align: right;">Rp ${otEarnings.toLocaleString('id-ID')}</td>
              </tr>
              <tr>
                <td>Tunjangan Jabatan & Operasional</td>
                <td>Tetap Bulanan</td>
                <td style="text-align: right; color: #16a34a;">+ Rp ${allowance.toLocaleString('id-ID')}</td>
              </tr>
              <tr>
                <td>Potongan Pajak & BPJS Kes/TK</td>
                <td>Potongan Wajib Bulanan</td>
                <td style="text-align: right; color: #dc2626;">- Rp ${deduction.toLocaleString('id-ID')}</td>
              </tr>
              <tr class="total-row">
                <td>Total Gaji Bersih (Net Take Home Pay)</td>
                <td></td>
                <td style="text-align: right; color: #f59e0b;">Rp ${netSalary.toLocaleString('id-ID')}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="payslip-footer">
            <div>
              <p>Jakarta, ${today}</p>
              <div class="payslip-signature">
                <p>Penerima,</p>
                <div class="line"></div>
                <p style="font-weight: 600; margin-top: 0.5rem;">${emp.name}</p>
              </div>
            </div>
            <div style="text-align: right;">
              <p>&nbsp;</p>
              <div class="payslip-signature" style="margin-left: auto;">
                <p>Finance Admin,</p>
                <div class="line"></div>
                <p style="font-weight: 600; margin-top: 0.5rem;">Admin N&N Supplies</p>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    this.openModal("payslipModal");
  },

  printPayslip() {
    window.print();
  },

  // Generic modal helpers
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("active");
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
  }
};

window.PayrollModule = PayrollModule;
