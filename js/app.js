const GAS_API = "https://script.google.com/macros/s/AKfycbzB4n24LjIVF316LDnGTkxFDe7byn17vgrpHU_lQEeZww8iR8K7qLDCj4e2NOdm_ulCBw/exec"; 

window.app = {
  user: null, currentDept: '', currentFlow: null, currentWorkflow: null, formMode: 'new', questions: [],
  cache: { dashboard: {}, deptFlows: {}, calendar: {}, questions: {} },

  init() {
    const twTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
    const tY = twTime.getFullYear(); const tM = twTime.getMonth(); const tD = twTime.getDate();
    const todayStr = `${tY}-${String(tM + 1).padStart(2, '0')}-${String(tD).padStart(2, '0')}`;

    document.getElementById('start-date').value = todayStr;
    document.getElementById('end-date').value = todayStr;
    document.getElementById('target-date').value = todayStr;

    const adminModalEl = document.getElementById('adminModal');
    if (adminModalEl) {
      adminModalEl.addEventListener('hide.bs.modal', () => {
        if (document.activeElement) document.activeElement.blur();
      });
    }
  },

  showLoading(show) { document.getElementById('loading').style.display = show ? 'flex' : 'none'; },

  async api(payload, background = false) {
    if (!background) this.showLoading(true);
    try {
      const res = await fetch(GAS_API, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload), redirect: 'follow'
      });
      const data = await res.json();
      if (!background) this.showLoading(false);
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch (e) {
      if (!background) {
         this.showLoading(false);
         alert("系統連線錯誤: 請確認網路狀態或後端是否正確發布。(" + e.message + ")");
      } else { console.error("背景傳輸失敗:", e); }
      throw e;
    }
  },

  async forceRefresh() {
    this.cache = { dashboard: {}, deptFlows: {}, calendar: {}, questions: {} };
    if (app.admin) app.admin.adminDataCache = null;

    if (app.calendar && app.calendar.instance) {
      app.calendar.instance.destroy(); app.calendar.instance = null;
    }
    
    // ✅ 清空系統總覽圖表
    if (app.dashboard && app.dashboard.charts) {
      for(let qId in app.dashboard.charts) { app.dashboard.charts[qId].destroy(); }
      app.dashboard.charts = {};
    }
    // ✅ 清空單位專區圖表
    if (app.department && app.department.charts) {
      for(let qId in app.department.charts) { app.department.charts[qId].destroy(); }
      app.department.charts = {};
    }

    const containers = [
      'dash-exc-list', 'dash-inc-list', 'dash-period-list', 'dash-ondemand-list', 'dash-charts',
      'calendar-container', 'calendar-details-container',
      'dept-exc-list', 'dept-inc-list', 'dept-period-list', 'dept-ondemand-list', 'dept-accordion-container', 'dept-charts', // ✅ 加入 dept-charts
      'form-container', 'form-actions'
    ];
    containers.forEach(id => { let el = document.getElementById(id); if (el) el.innerHTML = ''; });
    document.querySelectorAll('.list-container').forEach(el => el.innerHTML = '');

    if(this.user && this.user.empId) {
       try {
         let freshUser = await this.api({ action: 'login', empId: this.user.empId });
         this.user.availableDepts = freshUser.availableDepts;
         let menuHtml = '';
         this.user.availableDepts.forEach(d => {
           menuHtml += `<li><a onclick="app.department.loadDeptFlows('${d}', this)"><i class="bi bi-caret-right"></i> <span class="sidebar-text">${d}</span></a></li>`;
         });
         document.getElementById('dept-menu-container').innerHTML = menuHtml;
       } catch(e) { console.error("權限更新失敗", e); }
    }
    this.refreshCurrentPage();
  },

  toggleSidebar() { 
    const sidebar = document.getElementById('sidebar');
    if (document.body.classList.contains('mobile-mode') || window.innerWidth <= 768) sidebar.classList.toggle('open');
    else sidebar.classList.toggle('collapsed'); 
  },

  switchView(viewId, title = '') {
    document.querySelectorAll('.content-view').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    if (title) document.getElementById('page-main-title').innerHTML = title;
    
    const rangeCtrl = document.getElementById('date-range-container');
    const singleCtrl = document.getElementById('date-single-container');
    
    if(viewId === 'view-dashboard' || viewId === 'view-calendar') {
      rangeCtrl.classList.remove('d-none'); singleCtrl.classList.add('d-none');
    } else if (viewId === 'view-dept-flows') {
      rangeCtrl.classList.add('d-none'); singleCtrl.classList.remove('d-none');
    } else {
      rangeCtrl.classList.add('d-none'); singleCtrl.classList.add('d-none');
    }
  },

  setActiveMenu(target) {
    document.querySelectorAll('#sidebar ul li').forEach(li => li.classList.remove('active'));
    if(target) target.closest('li').classList.add('active');
    if (document.body.classList.contains('mobile-mode') || window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('open');
    }
  },

  // 覆蓋原本的 login 函式
  async login(mode) {
    const empId = document.getElementById('login-emp-id').value;
    if(!empId) return alert("請輸入員工編號");
    document.body.className = mode === 'mobile' ? 'mobile-mode' : 'desktop-mode';
    this.user = await this.api({ action: 'login', empId });
    document.getElementById('user-info').innerText = `${this.user.empName}`;
    
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('main-system').style.display = 'block';

    if (mode === 'mobile') {
      // 手機版：不渲染側邊欄，直接進入單位選單
      this.loadMobileMenu();
    } else {
      // 桌機版：正常渲染側邊欄與總覽
      let menuHtml = '';
      this.user.availableDepts.forEach(d => {
        menuHtml += `<li><a onclick="app.department.loadDeptFlows('${d}', this)"><i class="bi bi-caret-right"></i> <span class="sidebar-text">${d}</span></a></li>`;
      });
      document.getElementById('dept-menu-container').innerHTML = menuHtml;
      app.dashboard.loadDashboard(document.querySelector('#sidebar ul li a'));
    }

    this.api({ action: 'incrementCounter', type: 'SYSTEM', id: 'SYSTEM' }, true)
       .then(res => {
           const el = document.getElementById('sys-view-counter');
           if(el) el.innerText = res.count;
       }).catch(e => console.error("計數器更新失敗", e));
  },

  // 新增：生成手機版選單
  loadMobileMenu() {
    app.currentDept = ''; // 清除當前單位狀態
    app.switchView('view-mobile-menu', '選擇執行單位');
    document.getElementById('mobile-back-btn').classList.add('d-none'); // 選單首頁隱藏返回按鈕
    
    let html = '';
    this.user.availableDepts.forEach(d => {
       html += `<button class="btn btn-outline-primary btn-lg fw-bold text-start p-3 shadow-sm border-2 rounded-3 bg-white" onclick="app.department.loadDeptFlows('${d}')">
                  <i class="bi bi-building me-2"></i> ${d}
                </button>`;
    });
    document.getElementById('mobile-dept-list').innerHTML = html;
  },

  logout() {
    if(!confirm("確定要登出嗎？")) return;
    this.user = null; this.currentDept = '';
    this.cache = { dashboard: {}, deptFlows: {}, calendar: {}, questions: {} };
    if (app.admin) app.admin.adminDataCache = null;
    document.getElementById('login-emp-id').value = '';
    
    document.getElementById('main-system').style.display = 'none';
    document.getElementById('login-page').style.display = 'block';
    document.body.className = 'desktop-mode';
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar').classList.remove('collapsed');
  },

  // 覆蓋原本的 refreshCurrentPage，加入手機版選單的刷新判斷
  refreshCurrentPage() {
    if(document.getElementById('view-mobile-menu').classList.contains('active')) this.loadMobileMenu();
    else if(document.getElementById('view-dashboard').classList.contains('active')) app.dashboard.loadDashboard();
    else if(document.getElementById('view-dept-flows').classList.contains('active')) app.department.loadDeptFlows(app.currentDept);
    else if(document.getElementById('view-calendar').classList.contains('active')) app.calendar.loadCalendar();
    else if(document.getElementById('view-admin-workflows').classList.contains('active')) app.admin.loadAdminWorkflows();
    else if(document.getElementById('view-admin-flows').classList.contains('active')) app.admin.loadAdminFlows();
    else if(document.getElementById('view-admin-questions').classList.contains('active')) app.admin.loadAdminQuestions();
  }
};
window.onload = () => app.init();
