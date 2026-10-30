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

  // ✅ 優化：減輕預載負擔，剔除總覽與圖表，只保留題目架構與單位任務清單
  async preloadAllData() {
    const loading = document.getElementById('loading');
    loading.innerHTML = `<div class="text-center bg-white p-4 rounded shadow-lg border border-primary" style="min-width: 320px;">
                            <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                            <h5 class="fw-bold text-dark mb-3" id="loading-text">系統初始化...</h5>
                            <div class="progress" style="height: 15px; width: 100%; border-radius: 10px;">
                               <div id="loading-bar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width: 0%"></div>
                            </div>
                            <small class="text-muted mt-2 d-block">正在拉取任務資料，請稍候 (<span id="loading-pct">0</span>%)</small>
                         </div>`;
    this.showLoading(true);

    try {
        const targetDate = document.getElementById('target-date').value;
        let depts = this.user.availableDepts || [];
        
        // 任務總數：1 (題目架構) + 單位數量
        let totalTasks = 1 + depts.length; 
        let completed = 0;
        
        const updateProgress = (name) => {
            completed++;
            let pct = Math.round((completed / totalTasks) * 100);
            document.getElementById('loading-text').innerText = name;
            document.getElementById('loading-bar').style.width = pct + '%';
            document.getElementById('loading-pct').innerText = pct;
        };

        // 1. 預載題目與表單架構 (確保點擊表單秒開)
        let adminData = await this.api({ action: 'getAdminData' }, true);
        app.admin = app.admin || {}; app.admin.adminDataCache = adminData;
        adminData.flows.forEach(f => {
            let qList = adminData.questions.filter(q => String(q.flowId) === String(f.id)).map(q => ({
                qId: q.id, title: q.title, type: q.type, options: q.options ? q.options.split(',') : [],
                min: q.min !== null ? Number(q.min) : null, max: q.max !== null ? Number(q.max) : null, 
                isRequired: q.req, excCond: q.excCond, hint: q.hint, defVal: q.defVal
            }));
            this.cache.questions[f.id] = { flowName: f.name, flowStatus: f.active === '關閉' ? '關閉' : (f.active === '維修中' ? '維修中' : '正常'), questions: qList };
        });
        updateProgress(depts.length > 0 ? '載入各單位任務清單...' : '即將完成...');

        // 2. 僅預載各單位的「任務清單」(移除總覽與圖表，節省大量等待時間)
        for (let dept of depts) {
            const deptKey = `${dept}_${targetDate}`;
            this.cache.deptFlows[deptKey] = await this.api({ action: 'getDeptFlows', department: dept, targetDate: targetDate }, true);
            updateProgress(completed === totalTasks - 1 ? '即將完成...' : `載入下一個單位...`);
        }
        
    } catch (e) {
        console.error(e);
        alert("資料預載時發生網路錯誤，部分畫面可能需要手動重整。");
    } finally {
        // 恢復預設的轉圈樣式，以備後續單獨讀取時使用
        loading.innerHTML = `<div class="spinner-border text-primary" role="status"></div>`;
        this.showLoading(false);
    }
  },

  async forceRefresh() {
    this.cache = { dashboard: {}, deptFlows: {}, calendar: {}, questions: {} };
    if (app.admin) app.admin.adminDataCache = null;

    if (app.calendar && app.calendar.instance) {
      app.calendar.instance.destroy(); app.calendar.instance = null;
    }
    
    if (app.dashboard && app.dashboard.charts) {
      for(let qId in app.dashboard.charts) { app.dashboard.charts[qId].destroy(); }
      app.dashboard.charts = {};
    }
    if (app.department && app.department.charts) {
      for(let qId in app.department.charts) { app.department.charts[qId].destroy(); }
      app.department.charts = {};
    }

    const containers = [
      'dash-exc-list', 'dash-inc-list', 'dash-period-list', 'dash-ondemand-list', 'dash-charts',
      'calendar-container', 'calendar-details-container',
      'dept-exc-list', 'dept-inc-list', 'dept-period-list', 'dept-ondemand-list', 'dept-accordion-container', 'dept-charts', 
      'form-container', 'form-actions'
    ];
    containers.forEach(id => { let el = document.getElementById(id); if (el) el.innerHTML = ''; });
    document.querySelectorAll('.list-container').forEach(el => el.innerHTML = '');

    if(this.user && this.user.empId) {
       try {
         let freshUser = await this.api({ action: 'login', empId: this.user.empId }, true); 
         this.user.availableDepts = freshUser.availableDepts;
         let menuHtml = '';
         this.user.availableDepts.forEach(d => {
           menuHtml += `<li><a onclick="app.department.loadDeptFlows('${d}', this)"><i class="bi bi-caret-right"></i> <span class="sidebar-text">${d}</span></a></li>`;
         });
         document.getElementById('dept-menu-container').innerHTML = menuHtml;

         await this.preloadAllData();
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
    const refreshBtn = document.getElementById('refresh-btn');
    const mobileBackBtn = document.getElementById('mobile-back-btn'); 
    
    if (viewId === 'view-dashboard' || viewId === 'view-calendar') {
      rangeCtrl.classList.remove('d-none'); singleCtrl.classList.add('d-none');
      if (refreshBtn) refreshBtn.classList.remove('d-none');
      if (mobileBackBtn) mobileBackBtn.classList.add('d-none');

    } else if (viewId === 'view-dept-flows') {
      rangeCtrl.classList.add('d-none'); singleCtrl.classList.remove('d-none');
      if (refreshBtn) refreshBtn.classList.remove('d-none');

    } else if (viewId === 'view-mobile-menu') {
      rangeCtrl.classList.add('d-none'); singleCtrl.classList.add('d-none');
      if (refreshBtn) refreshBtn.classList.add('d-none');
      if (mobileBackBtn) mobileBackBtn.classList.add('d-none');

    } else if (viewId === 'view-form') {
      rangeCtrl.classList.add('d-none'); singleCtrl.classList.add('d-none');
      if (refreshBtn) refreshBtn.classList.add('d-none');
      if (mobileBackBtn) mobileBackBtn.classList.add('d-none');

    } else {
      rangeCtrl.classList.add('d-none'); singleCtrl.classList.add('d-none');
      if (refreshBtn) refreshBtn.classList.remove('d-none');
      if (mobileBackBtn) mobileBackBtn.classList.add('d-none');
    }
  },

  setActiveMenu(target) {
    document.querySelectorAll('#sidebar ul li').forEach(li => li.classList.remove('active'));
    if(target) target.closest('li').classList.add('active');
    if (document.body.classList.contains('mobile-mode') || window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('open');
    }
  },

  async login(mode) {
    const empId = document.getElementById('login-emp-id').value;
    if(!empId) return alert("請輸入員工編號");
    document.body.className = mode === 'mobile' ? 'mobile-mode' : 'desktop-mode';
    this.user = await this.api({ action: 'login', empId });
    document.getElementById('user-info').innerText = `${this.user.empName}`;
    
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('main-system').style.display = 'block';

    await this.preloadAllData();

    if (mode === 'mobile') {
      this.loadMobileMenu();
    } else {
      let menuHtml = '';
      this.user.availableDepts.forEach(d => {
        menuHtml += `<li><a onclick="app.department.loadDeptFlows('${d}', this)"><i class="bi bi-caret-right"></i> <span class="sidebar-text">${d}</span></a></li>`;
      });
      document.getElementById('dept-menu-container').innerHTML = menuHtml;
      // 桌機版會因為跳轉總覽而觸發總覽的單獨載入
      app.dashboard.loadDashboard(document.querySelector('#sidebar ul li a'));
    }

    this.api({ action: 'incrementCounter', type: 'SYSTEM', id: 'SYSTEM' }, true).catch(e=>console.error(e));
  },

  loadMobileMenu() {
    app.currentDept = ''; 
    app.switchView('view-mobile-menu', '選擇執行單位');
    document.getElementById('mobile-back-btn').classList.add('d-none'); 
    
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
