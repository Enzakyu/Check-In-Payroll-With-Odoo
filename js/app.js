// js/app.js

document.addEventListener("DOMContentLoaded", async () => {
  // Ambil data karyawan terupdate dari Odoo terlebih dahulu
  await Database.loadEmployees();

  // Initialize sub-modules
  CheckinModule.init();
  PayrollModule.init();
  OdooModule.init();

  // Setup Navigation Routing
  const navButtons = document.querySelectorAll(".nav-menu .nav-item");
  const views = document.querySelectorAll(".page-view");

  navButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const viewId = btn.getAttribute("data-view");
      
      // Update sidebar nav active state
      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Toggle views
      views.forEach(view => {
        if (view.id === viewId + "View") {
          view.classList.add("active");
        } else {
          view.classList.remove("active");
        }
      });

      // Refresh data on switching views
      if (viewId === "admin") {
        await PayrollModule.refreshDashboard();
      } else if (viewId === "odoo") {
        OdooModule.renderMappings();
      } else if (viewId === "checkin") {
        CheckinModule.renderEmployeeSelector();
        CheckinModule.updateCheckInStatus();
      }
    });
  });
});
