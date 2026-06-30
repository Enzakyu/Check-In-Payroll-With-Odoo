// js/checkin.js

const CheckinModule = {
  selectedEmployeeId: "",
  clockInterval: null,
  simulatedGeo: {
    lat: -6.2088, // Jakarta area representation
    lng: 106.8456,
    accuracy: 12, // meters
    status: "Within N&N Supplies HQ Radius"
  },

  async init() {
    this.selectedEmployeeId = Database.getEmployees()[0]?.id || "";
    this.startClock();
    this.renderEmployeeSelector();
    
    if (this.selectedEmployeeId) {
      const emp = Database.getEmployee(this.selectedEmployeeId);
      if (emp && emp.odooId) {
        await Database.loadAttendance(emp.odooId);
      }
    }
    
    this.updateCheckInStatus();
    this.setupEventListeners();
  },

  startClock() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    
    const updateTime = () => {
      const timeEl = document.getElementById("liveTime");
      const dateEl = document.getElementById("liveDate");
      if (!timeEl || !dateEl) return;

      const now = new Date();
      
      // Format time: HH:MM:SS
      timeEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false });
      
      // Format date: Day name, Date Month Year
      dateEl.textContent = now.toLocaleDateString('id-ID', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    };
    
    updateTime();
    this.clockInterval = setInterval(updateTime, 1000);
  },

  renderEmployeeSelector() {
    const container = document.getElementById("employeeSelector");
    if (!container) return;

    const employees = Database.getEmployees();
    container.innerHTML = employees.map(emp => `
      <div class="user-card ${emp.id === this.selectedEmployeeId ? 'selected' : ''}" data-id="${emp.id}">
        <img src="${emp.avatar}" alt="${emp.name}">
        <p class="name">${emp.name}</p>
        <p class="role">${emp.role.split(' & ')[0]}</p>
      </div>
    `).join('');

    // Add click events
    container.querySelectorAll(".user-card").forEach(card => {
      card.addEventListener("click", async () => {
        container.querySelectorAll(".user-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        this.selectedEmployeeId = card.getAttribute("data-id");
        
        const emp = Database.getEmployee(this.selectedEmployeeId);
        if (emp && emp.odooId) {
          await Database.loadAttendance(emp.odooId);
        }
        
        this.updateCheckInStatus();
      });
    });
  },

  updateCheckInStatus() {
    if (!this.selectedEmployeeId) return;

    const emp = Database.getEmployee(this.selectedEmployeeId);
    const activeLog = Database.getActiveCheckIn(this.selectedEmployeeId);
    
    // Update employee profile details on dashboard
    const profilePic = document.getElementById("selectedEmpPic");
    const nameEl = document.getElementById("selectedEmpName");
    const roleEl = document.getElementById("selectedEmpRole");
    const actionBtn = document.getElementById("checkInActionBtn");

    if (profilePic) profilePic.src = emp.avatar;
    if (nameEl) nameEl.textContent = emp.name;
    if (roleEl) roleEl.textContent = emp.role;

    if (actionBtn) {
      if (activeLog) {
        actionBtn.className = "btn btn-danger";
        actionBtn.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i> CLOCK OUT`;
        actionBtn.dataset.action = "checkout";
      } else {
        actionBtn.className = "btn btn-success";
        actionBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> CLOCK IN`;
        actionBtn.dataset.action = "checkin";
      }
    }

    this.renderPersonalLogs();
    this.simulateLocation();
  },

  simulateLocation() {
    const mapLabel = document.getElementById("mapLabel");
    const radar = document.getElementById("mapRadar");
    
    if (!mapLabel || !radar) return;

    // Introduce small variance
    const isMockSuccess = Math.random() > 0.15;
    if (isMockSuccess) {
      radar.style.borderColor = "var(--success)";
      radar.style.background = "rgba(16, 185, 129, 0.1)";
      mapLabel.style.color = "var(--success)";
      mapLabel.innerHTML = `<i class="fa-solid fa-location-dot"></i> Within HQ Radius (Accuracy: ${Math.floor(Math.random() * 5) + 3}m)`;
      this.simulatedGeo.status = "Within N&N Supplies HQ Radius";
    } else {
      radar.style.borderColor = "var(--primary)";
      radar.style.background = "rgba(245, 158, 11, 0.1)";
      mapLabel.style.color = "var(--primary)";
      mapLabel.innerHTML = `<i class="fa-solid fa-location-dot"></i> Dispatch / Remote (Simulated GPS)`;
      this.simulatedGeo.status = "Remote / Dispatch Field Work";
    }
  },

  renderPersonalLogs() {
    const listBody = document.getElementById("personalLogsBody");
    if (!listBody) return;

    const logs = Database.getAttendanceForEmployee(this.selectedEmployeeId);
    
    if (logs.length === 0) {
      listBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Belum ada log kehadiran minggu ini.</td></tr>`;
      return;
    }

    listBody.innerHTML = logs.map(log => {
      const checkInFormatted = log.checkIn;
      const checkOutFormatted = log.checkOut || `<span class="badge badge-warning">Active Now</span>`;
      
      let durationStr = "-";
      if (log.checkOut) {
        durationStr = this.calculateDuration(log.checkIn, log.checkOut) + " hrs";
      }

      return `
        <tr>
          <td>${this.formatDateIndo(log.date)}</td>
          <td>${checkInFormatted}</td>
          <td>${checkOutFormatted}</td>
          <td>${durationStr}</td>
        </tr>
      `;
    }).join('');
  },

  calculateDuration(checkIn, checkOut) {
    const [h1, m1, s1] = checkIn.split(':').map(Number);
    const [h2, m2, s2] = checkOut.split(':').map(Number);
    
    const d1 = new Date(2000, 0, 1, h1, m1, s1 || 0);
    const d2 = new Date(2000, 0, 1, h2, m2, s2 || 0);
    
    const diffMs = d2 - d1;
    const diffHrs = diffMs / (1000 * 60 * 60);
    return diffHrs.toFixed(2);
  },

  formatDateIndo(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  setupEventListeners() {
    const actionBtn = document.getElementById("checkInActionBtn");
    if (!actionBtn) return;

    // Remove any existing listeners
    const newActionBtn = actionBtn.cloneNode(true);
    actionBtn.parentNode.replaceChild(newActionBtn, actionBtn);

    newActionBtn.addEventListener("click", async () => {
      const action = newActionBtn.dataset.action;
      const notesEl = document.getElementById("checkInNotes");
      const emp = Database.getEmployee(this.selectedEmployeeId);
      
      if (!emp || !emp.odooId) {
        alert("Karyawan ini belum terhubung dengan Odoo ID.");
        return;
      }

      if (action === "checkin") {
        const res = await Database.clockIn(emp.odooId);
        if (res.success) {
          if (notesEl) notesEl.value = "";
          this.showNotification("Success", "Check-in berhasil tercatat langsung di Odoo!", "success");
        } else {
          this.showNotification("Gagal", res.error || "Gagal melakukan Check-in", "danger");
        }
      } else {
        const res = await Database.clockOut(emp.odooId);
        if (res.success) {
          if (notesEl) notesEl.value = "";
          this.showNotification("Success", "Check-out berhasil tercatat langsung di Odoo!", "success");
        } else {
          this.showNotification("Gagal", res.error || "Gagal melakukan Check-out", "danger");
        }
      }

      // Reload absensi terupdate dari Odoo
      await Database.loadAttendance(emp.odooId);
      this.updateCheckInStatus();
      
      // If Admin dashboard needs updating
      if (typeof PayrollModule !== 'undefined' && document.getElementById("adminView").classList.contains("active")) {
        PayrollModule.refreshDashboard();
      }
    });
  },

  showNotification(title, message, type = "success") {
    // Add simple notification popup
    const popup = document.createElement("div");
    popup.style.position = "fixed";
    popup.style.bottom = "20px";
    popup.style.right = "20px";
    popup.style.background = type === "success" ? "var(--success)" : "var(--danger)";
    popup.style.color = "#000";
    popup.style.padding = "1rem 1.5rem";
    popup.style.borderRadius = "10px";
    popup.style.fontWeight = "bold";
    popup.style.boxShadow = "0 10px 15px rgba(0,0,0,0.3)";
    popup.style.zIndex = "1000";
    popup.style.display = "flex";
    popup.style.alignItems = "center";
    popup.style.gap = "10px";
    popup.style.animation = "slideIn 0.3s ease-out";
    
    popup.innerHTML = `
      <i class="${type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation'}"></i>
      <div>
        <div style="font-size: 0.95rem;">${title}</div>
        <div style="font-size: 0.8rem; font-weight: normal; opacity: 0.9;">${message}</div>
      </div>
    `;

    document.body.appendChild(popup);
    setTimeout(() => {
      popup.style.animation = "slideOut 0.3s ease-in forwards";
      setTimeout(() => popup.remove(), 300);
    }, 3000);
  }
};

// Add standard slide anim styles if needed
const style = document.createElement('style');
style.textContent = `
@keyframes slideIn {
  from { transform: translateX(120%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes slideOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(120%); opacity: 0; }
}
`;
document.head.appendChild(style);

window.CheckinModule = CheckinModule;
