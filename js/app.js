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

  async preloadData(targetDept = '全部') {
    if (!targetDept) return; // 如果在首頁則不預載
    
    const targetDate = document.getElementById('target-date').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    let deptsToLoad = targetDept === '全部' ? (this.user.availableDepts || []) : [targetDept];

    // 1. 檢查是否需要的資料都已經在快取中 (用多少查多少)
    let tasks = [];
    if (!app.admin || !app.admin.adminDataCache) tasks.push('admin');
    if (targetDept === '全部' && !this.cache.dashboard[`${startDate}_${endDate}_all`]) tasks.push('dashboard');
    for (let dept of deptsToLoad) {
        if (!this.cache.deptFlows[`${dept}_${targetDate}`]) tasks.push(`dept_${dept}`);
    }

    // ✅ 如果全部都在快取內，直接 return 秒開！連轉圈畫面都不會出現
    if (tasks.length === 0) return; 

    // 2. 有缺資料，顯示友善的進度條並只拉取缺少的資料
    const loading = document.getElementById('loading');
    loading.innerHTML = `<div class="text-center bg-white p-4 rounded shadow-lg border border-primary" style="min-width: 320px;">
                            <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                            <h5 class="fw-bold text-dark mb-3" id="loading-text">資料拉取中...</h5>
                            <div class="progress" style="height: 15px; width: 100%; border-radius: 10px;">
                               <div id="loading-bar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width: 0%"></div>
                            </div>
                            <small class="text-muted mt-2 d-block">正在載入所需任務，請稍候 (<span id="loading-pct">0</span>%)</small>
                         </div>`;
    this.showLoading(true);

    try {
        let completed = 0;
        const updateProgress = (name) => {
            completed++;
            let pct = Math.round((completed / tasks.length) * 100);
            document.getElementById('loading-text').innerText = name;
            document.getElementById('loading-bar').style.width = pct + '%';
            document.getElementById('loading-pct').innerText = pct;
        };

        if (tasks.includes('admin')) {
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
            updateProgress(tasks.length > 1 ? '準備單位資料...' : '即將完成...');
        }

        if (tasks.includes('dashboard')) {
            const dashKey = `${startDate}_${endDate}_all`;
            this.cache.dashboard[dashKey] = await this.api({ action: 'getDashboard', startDate, endDate, department: '' }, true);
            updateProgress(completed === tasks.length - 1 ? '即將完成...' : '載入清單...');
        }

        for (let dept of deptsToLoad) {
            if (tasks.includes(`dept_${dept}`)) {
                const deptKey = `${dept}_${targetDate}`;
                this.cache.deptFlows[deptKey] = await this.api({ action: 'getDeptFlows', department: dept, targetDate: targetDate }, true);
                updateProgress(completed === tasks.length - 1 ? '即將完成...' : `載入下一個單位...`);
            }
        }
    } catch (e) {
        console.error(e);
        alert("資料預載時發生網路錯誤，部分畫面可能需要手動重整。");
    } finally {
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
           // ✅ 側邊欄重新整理時也綁定 selectDept，確保點擊有預載快取
           menuHtml += `<li><a onclick="app.selectDept('${d}', this)"><i class="bi bi-caret-right"></i> <span class="sidebar-text">${d}</span></a></li>`;
         });
         document.getElementById('dept-menu-container').innerHTML = menuHtml;

         let target = app.currentDept || '全部';
         if (document.getElementById('view-mobile-menu').classList.contains('active')) target = ''; 
         if (target) await this.preloadData(target);
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
      
      if (mobileBackBtn) {
          if (document.body.classList.contains('mobile-mode') && viewId === 'view-dashboard') mobileBackBtn.classList.remove('d-none');
          else mobileBackBtn.classList.add('d-none');
      }

    } else if (viewId === 'view-dept-flows') {
      rangeCtrl.classList.add('d-none'); singleCtrl.classList.remove('d-none');
      if (refreshBtn) refreshBtn.classList.remove('d-none');
      if (mobileBackBtn && document.body.classList.contains('mobile-mode')) mobileBackBtn.classList.remove('d-none');

    } else if (viewId === 'view-mobile-menu' || viewId === 'view-form') {
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

    // ✅ 桌機版側邊欄也建立，但同樣綁定 selectDept 邏輯
    let menuHtml = '';
    this.user.availableDepts.forEach(d => {
      menuHtml += `<li><a onclick="app.selectDept('${d}', this)"><i class="bi bi-caret-right"></i> <span class="sidebar-text">${d}</span></a></li>`;
    });
    document.getElementById('dept-menu-container').innerHTML = menuHtml;

    // ✅ 關鍵修改：不論桌機或手機，登入後都直接進選單，不轉圈！
    this.loadHomeMenu();

    this.api({ action: 'incrementCounter', type: 'SYSTEM', id: 'SYSTEM' }, true).catch(e=>console.error(e));
  },

  // 為了向後相容保留的別名
  loadMobileMenu() { this.loadHomeMenu(); },

  loadHomeMenu() {
    app.currentDept = ''; 
    app.switchView('view-mobile-menu', '選擇執行單位');
    const mobileBackBtn = document.getElementById('mobile-back-btn');
    if (mobileBackBtn) mobileBackBtn.classList.add('d-none'); 
    
    let html = '';
    this.user.availableDepts.forEach(d => {
       html += `<button class="btn btn-outline-primary btn-lg fw-bold text-start p-3 shadow-sm border-2 rounded-3 bg-white" onclick="app.selectDept('${d}')">
                  <i class="bi bi-building me-2"></i> ${d}
                </button>`;
    });
    html += `<button class="btn btn-outline-secondary btn-lg fw-bold text-start p-3 shadow-sm border-2 rounded-3 bg-white mt-2" onclick="app.selectDept('全部')">
                <i class="bi bi-collection me-2"></i> 全部 (載入所有單位與總覽)
             </button>`;
    
    document.getElementById('mobile-dept-list').innerHTML = html;
  },

  async selectDept(dept, menuItem = null) {
    if (menuItem) app.setActiveMenu(menuItem);
    await this.preloadData(dept); // 預載該單位 (如果有快取則秒開不轉圈)
    app.currentDept = dept === '全部' ? '' : dept;

    if (dept === '全部') {
        app.dashboard.loadDashboard();
        const dashLink = document.querySelector('#sidebar ul li a[onclick*="loadDashboard"]');
        if (dashLink) app.setActiveMenu(dashLink);
    } else {
        app.department.loadDeptFlows(dept, menuItem);
        if (!menuItem) {
            const deptLink = document.querySelector(`#sidebar ul li a[onclick*="selectDept('${dept}')"]`);
            if (deptLink) app.setActiveMenu(deptLink);
        }
    }
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
    if(document.getElementById('view-mobile-menu').classList.contains('active')) this.loadHomeMenu();
    else if(document.getElementById('view-dashboard').classList.contains('active')) app.dashboard.loadDashboard();
    else if(document.getElementById('view-dept-flows').classList.contains('active')) app.department.loadDeptFlows(app.currentDept);
    else if(document.getElementById('view-calendar').classList.contains('active')) app.calendar.loadCalendar();
    else if(document.getElementById('view-admin-workflows').classList.contains('active')) app.admin.loadAdminWorkflows();
    else if(document.getElementById('view-admin-flows').classList.contains('active')) app.admin.loadAdminFlows();
    else if(document.getElementById('view-admin-questions').classList.contains('active')) app.admin.loadAdminQuestions();
  }
};
window.onload = () => app.init();
