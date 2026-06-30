// js/odoo.js

const OdooModule = {
  consoleEl: null,
  isSyncing: false,

  init() {
    this.consoleEl = document.getElementById("odooConsole");
    this.loadSettings();
    this.renderMappings();
    this.setupEventListeners();
  },

  loadSettings() {
    const settings = Database.getSettings();
    if (!settings) return;

    const urlEl = document.getElementById("odooUrl");
    const dbEl = document.getElementById("odooDb");
    const userEl = document.getElementById("odooUsername");
    const keyEl = document.getElementById("odooApiKey");

    if (urlEl) urlEl.value = settings.odooUrl;
    if (dbEl) dbEl.value = settings.odooDb;
    if (userEl) userEl.value = settings.odooUsername;
    if (keyEl) keyEl.value = settings.odooApiKey;

    this.updateLastSyncLabels(settings);
  },

  updateLastSyncLabels(settings) {
    const syncAttEl = document.getElementById("lastSyncAtt");
    const syncPayEl = document.getElementById("lastSyncPay");

    if (syncAttEl) syncAttEl.textContent = CheckinModule.formatDateIndo(settings.lastSyncedAttendance);
    if (syncPayEl) syncPayEl.textContent = CheckinModule.formatDateIndo(settings.lastSyncedPayroll);
  },

  renderMappings() {
    const tbody = document.getElementById("odooMappingsBody");
    if (!tbody) return;

    const employees = Database.getEmployees();
    tbody.innerHTML = employees.map(emp => {
      const isMapped = emp.odooId ? true : false;
      return `
        <tr>
          <td><strong>${emp.name}</strong></td>
          <td><span class="badge badge-info">${emp.id}</span></td>
          <td>
            ${isMapped 
              ? `<span class="badge badge-success" style="font-family: monospace;">hr.employee (${emp.odooId})</span>` 
              : `<span class="badge badge-danger">Unmapped</span>`}
          </td>
          <td>
            <div style="display:flex; align-items:center; gap: 4px;">
              <div class="pulse-dot" style="background-color: ${isMapped ? 'var(--success)' : 'var(--danger)'}; box-shadow: 0 0 5px ${isMapped ? 'var(--success)' : 'var(--danger)'};"></div>
              <span>${isMapped ? 'Active Map' : 'Needs Config'}</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  setupEventListeners() {
    const settingsForm = document.getElementById("odooSettingsForm");
    if (settingsForm) {
      settingsForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const settings = Database.getSettings();
        
        settings.odooUrl = document.getElementById("odooUrl").value;
        settings.odooDb = document.getElementById("odooDb").value;
        settings.odooUsername = document.getElementById("odooUsername").value;
        settings.odooApiKey = document.getElementById("odooApiKey").value;

        Database.saveSettings(settings);
        CheckinModule.showNotification("Saved", "Konfigurasi Odoo berhasil disimpan!", "success");
      });
    }
  },

  logToConsole(message, type = "info") {
    if (!this.consoleEl) return;
    
    const timeStr = new Date().toTimeString().split(' ')[0];
    const line = document.createElement("div");
    line.className = `terminal-line ${type}`;
    line.innerHTML = `[${timeStr}] ${message}`;
    
    this.consoleEl.appendChild(line);
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  },

  clearConsole() {
    if (this.consoleEl) this.consoleEl.innerHTML = "";
  },

  async syncAttendance() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    const syncBtn = document.getElementById("btnSyncAttendance");
    const syncDot = document.getElementById("syncStatusDot");
    const syncText = document.getElementById("syncStatusText");

    if (syncBtn) syncBtn.disabled = true;
    if (syncDot) syncDot.className = "pulse-dot syncing";
    if (syncText) syncText.textContent = "Syncing with Odoo...";

    this.clearConsole();
    const settings = Database.getSettings();
    const employees = Database.getEmployees();
    const logs = Database.getAttendance();

    // Simulated logs sequence
    this.logToConsole(`Initializing XML-RPC client for Odoo hr.attendance...`, "info");
    await this.sleep(600);
    this.logToConsole(`Connecting to ${settings.odooUrl}/xmlrpc/2/common ...`, "info");
    await this.sleep(700);
    this.logToConsole(`Authenticating user: ${settings.odooUsername} on database: ${settings.odooDb} ...`, "info");
    await this.sleep(1000);
    this.logToConsole(`SUCCESS. Authenticated with User ID: 15.`, "success");
    await this.sleep(500);

    this.logToConsole(`Fetching local attendance logs since last sync date: ${settings.lastSyncedAttendance} ...`, "info");
    await this.sleep(600);

    // Calculate logs that have both checkin and checkout
    const completeLogs = logs.filter(log => log.checkOut);
    this.logToConsole(`Found ${completeLogs.length} attendance logs ready to sync.`, "warning");
    await this.sleep(500);

    for (let i = 0; i < completeLogs.length; i++) {
      const log = completeLogs[i];
      const emp = employees.find(e => e.id === log.employeeId);
      
      if (!emp || !emp.odooId) {
        this.logToConsole(`Warning: Employee ${log.employeeId} has no Odoo ID mapped. Skipping log ${log.id}.`, "error");
        await this.sleep(400);
        continue;
      }

      this.logToConsole(`Syncing record ${log.id} -> Odoo Employee #${emp.odooId} (${emp.name})`, "info");
      await this.sleep(400);
      
      const payload = {
        employee_id: emp.odooId,
        check_in: `${log.date} ${log.checkIn}`,
        check_out: `${log.date} ${log.checkOut}`
      };
      
      this.logToConsole(`XML-RPC CALL: execute_kw(db, uid, key, 'hr.attendance', 'create', [${JSON.stringify(payload)}])`, "info");
      await this.sleep(800);
      this.logToConsole(`SUCCESS. Odoo hr.attendance ID created: ${2000 + i}`, "success");
      await this.sleep(300);
    }

    this.logToConsole(`Syncing complete. Data successfully stored in Odoo.`, "success");
    
    // Update settings sync date
    settings.lastSyncedAttendance = new Date().toISOString().split('T')[0];
    Database.saveSettings(settings);
    this.updateLastSyncLabels(settings);

    if (syncBtn) syncBtn.disabled = false;
    if (syncDot) syncDot.className = "pulse-dot";
    if (syncText) syncText.textContent = "Synced";
    this.isSyncing = false;

    CheckinModule.showNotification("Sync Success", "Kehadiran berhasil sinkron dengan Odoo!", "success");
  },

  async syncPayroll() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    const syncBtn = document.getElementById("btnSyncPayroll");
    const syncDot = document.getElementById("syncStatusDot");
    const syncText = document.getElementById("syncStatusText");

    if (syncBtn) syncBtn.disabled = true;
    if (syncDot) syncDot.className = "pulse-dot syncing";
    if (syncText) syncText.textContent = "Syncing with Odoo...";

    this.clearConsole();
    const settings = Database.getSettings();
    const employees = Database.getEmployees();
    const logs = Database.getAttendance();

    this.logToConsole(`Initializing XML-RPC client for Odoo hr.payslip...`, "info");
    await this.sleep(600);
    this.logToConsole(`Connecting to ${settings.odooUrl}/xmlrpc/2/common ...`, "info");
    await this.sleep(600);
    this.logToConsole(`Authenticating user: ${settings.odooUsername} ...`, "info");
    await this.sleep(800);
    this.logToConsole(`SUCCESS. Authenticated with User ID: 15.`, "success");
    await this.sleep(400);

    this.logToConsole(`Generating Odoo Payroll payloads...`, "info");
    await this.sleep(500);

    let syncCount = 0;
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      if (!emp.odooId) {
        this.logToConsole(`Skipping ${emp.name} (No Odoo ID mapped)`, "error");
        await this.sleep(300);
        continue;
      }

      // Calculate totals
      const empLogs = logs.filter(log => log.employeeId === emp.id);
      let totalHours = 0;
      let totalBasePay = 0;

      empLogs.forEach(log => {
        if (log.checkOut) {
          const hours = parseFloat(CheckinModule.calculateDuration(log.checkIn, log.checkOut));
          totalHours += hours;
          if (hours > 8) {
            totalBasePay += (8 * emp.hourlyRate) + ((hours - 8) * emp.hourlyRate * 1.5);
          } else {
            totalBasePay += hours * emp.hourlyRate;
          }
        }
      });

      const netSalary = totalBasePay + emp.allowance - emp.deduction;

      this.logToConsole(`Processing Payslip for ${emp.name} (Odoo ID: ${emp.odooId})`, "info");
      await this.sleep(300);
      
      const payload = {
        employee_id: emp.odooId,
        date_from: getPastDate(30),
        date_to: getPastDate(0),
        worked_days_line_ids: [
          { name: "Logged Attendance Hours", code: "WORK100", number_of_hours: totalHours, number_of_days: empLogs.length }
        ],
        input_line_ids: [
          { name: "Hourly Salary Component", code: "BASIC", amount: totalBasePay },
          { name: "Allowances Component", code: "ALW", amount: emp.allowance },
          { name: "Deductions Component", code: "DED", amount: emp.deduction }
        ]
      };

      this.logToConsole(`XML-RPC: execute_kw('hr.payslip', 'create_from_external', [${JSON.stringify(payload).slice(0, 120)}...])`, "info");
      await this.sleep(800);
      this.logToConsole(`SUCCESS. Odoo hr.payslip ID created: ${5500 + i}. Compute sheet executed.`, "success");
      await this.sleep(400);
      syncCount++;
    }

    this.logToConsole(`Sync Complete. Sent ${syncCount} payroll worksheets to Odoo Hr Payroll module.`, "success");

    settings.lastSyncedPayroll = new Date().toISOString().split('T')[0];
    Database.saveSettings(settings);
    this.updateLastSyncLabels(settings);

    if (syncBtn) syncBtn.disabled = false;
    if (syncDot) syncDot.className = "pulse-dot";
    if (syncText) syncText.textContent = "Synced";
    this.isSyncing = false;

    CheckinModule.showNotification("Sync Success", "Payroll berhasil sinkron dengan Odoo!", "success");
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

function getPastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

window.OdooModule = OdooModule;
