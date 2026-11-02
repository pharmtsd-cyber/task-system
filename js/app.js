const GAS_API = "https://script.google.com/macros/s/AKfycbzB4n24LjIVF316LDnGTkxFDe7byn17vgrpHU_lQEeZww8iR8K7qLDCj4e2NOdm_ulCBw/exec"; 

window.app = {
  user: null, currentDept: '', currentFlow: null, currentWorkflow: null, formMode: 'new', questions: [],
  cache: { dashboard: {}, deptFlows: {}, calendar: {}, questions: {} },
  loadedDate: null, // ✅ 紀錄網頁開啟時的初始日期

init() {
    const twTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
    const tY = twTime.getFullYear(); const tM = twTime.getMonth(); const tD = twTime.getDate();
    const todayStr = `${tY}-${String(tM + 1).padStart(2, '0')}-${String(tD).padStart(2, '0')}`;
    
    this.loadedDate = todayStr; // 儲存啟動日期

    // ✅ 新增：計算三個月前的 1 號 (包含當月、前一個月、前兩個月)
    let startD = new Date(tY, tM - 2, 1);
    const startStr = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-01`;

    // ✅ 將總覽的預設起始日改為三個月前
    document.getElementById('start-date').value = startStr; 
    document.getElementById('end-date').value = todayStr;
    document.getElementById('target-date').value = todayStr; // 單位執行任務維持預設看今天

    const adminModalEl = document.getElementById('adminModal');
    if (adminModalEl) {
      adminModalEl.addEventListener('hide.bs.modal', () => {
        if (document.activeElement) document.activeElement.blur();
      });
    }

    // 將計數器移到網頁開啟時就呼叫，只算「造訪次數」，並顯示在登入頁
    this.api({ action: 'incrementCounter', type: 'SYSTEM', id: 'SYSTEM' }, true)
       .then(res => {
           const el = document.getElementById('sys-view-counter');
           if(el) el.innerHTML = res.count; 
       }).catch(e => {
           const el = document.getElementById('sys-view-counter');
           if(el) el.innerHTML = "-";
       });

    // 防呆機制：每分鐘檢查一次是否「跨日」，若跨日則強制重整網頁更新日期
    setInterval(() => {
        const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
        const currentStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (this.loadedDate && currentStr !== this.loadedDate) {
            alert("系統偵測到已經跨日囉！為了確保您的任務日期正確，系統將自動重新整理。");
            window.location.reload();
        }
    }, 60000); 
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
    if (!targetDept) return;
    
    const targetDate = document.getElementById('target-date').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    let deptsToLoad = [];
    let tasks = [];
    
    if (!app.admin || !app.admin.adminDataCache) tasks.push('admin');
    
    if (targetDept === '全部') {
        deptsToLoad = this.user.availableDepts || [];
        if (!this.cache.dashboard[`${startDate}_${endDate}_all`]) tasks.push('dashboard');
    } else if (targetDept !== 'admin') {
        deptsToLoad = [targetDept];
    }

    for (let dept of deptsToLoad) {
        if (!this.cache.deptFlows[`${dept}_${targetDate}`]) tasks.push(`dept_${dept}`);
    }

    if (tasks.length === 0) return; 

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
           menuHtml += `<li><a onclick="app.selectDept('${d}', this)"><i class="bi bi-caret-right"></i> <span class="sidebar-text">${d}</span></a></li>`;
         });
         document.getElementById('dept-menu-container').innerHTML = menuHtml;

         const activeView = document.querySelector('.content-view.active').id;
         if (activeView === 'view-dashboard' || activeView === 'view-calendar') {
             await this.preloadData('全部');
         } else if (activeView.startsWith('view-admin')) {
             await this.preloadData('admin');
         } else if (app.currentDept) {
             await this.preloadData(app.currentDept);
         }
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
    
    // ✅ 修正：每次切換畫面時，強制將視窗與內容區塊的捲軸回到最上方
    window.scrollTo(0, 0);
    const contentEl = document.getElementById('content');
    if (contentEl) contentEl.scrollTop = 0;
    
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

    let menuHtml = '';
    this.user.availableDepts.forEach(d => {
      menuHtml += `<li><a onclick="app.selectDept('${d}', this)"><i class="bi bi-caret-right"></i> <span class="sidebar-text">${d}</span></a></li>`;
    });
    document.getElementById('dept-menu-container').innerHTML = menuHtml;

    this.loadHomeView();
    // 💡 登入時不再呼叫 API 更新計數器，交給 init() 去算造訪人次即可
  },

  loadMobileMenu() { this.loadHomeView(); },

  loadHomeView() {
    app.currentDept = ''; 
    app.switchView('view-mobile-menu', document.body.classList.contains('mobile-mode') ? '選擇執行單位' : '歡迎使用系統');
    const mobileBackBtn = document.getElementById('mobile-back-btn');
    if (mobileBackBtn) mobileBackBtn.classList.add('d-none'); 
    
    let html = '';
    if (document.body.classList.contains('mobile-mode')) {
        // ✅ 優化：手機版按鈕改成高質感卡片清單
        this.user.availableDepts.forEach(d => {
           html += `
           <button class="btn btn-outline-primary p-3 shadow-sm border-2 rounded-4 bg-white mb-3 d-flex align-items-center w-100" onclick="app.selectDept('${d}')" style="transition: 0.2s;">
              <div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3 shadow-sm" style="width: 48px; height: 48px; flex-shrink: 0;">
                <i class="bi bi-building fs-4"></i>
              </div>
              <div class="text-start flex-grow-1">
                <span class="d-block fs-5 fw-bold text-dark">${d}</span>
                <small class="text-muted fw-normal">點擊進入單位任務</small>
              </div>
              <i class="bi bi-chevron-right text-primary fs-4"></i>
           </button>`;
        });
        html += `
        <button class="btn btn-outline-secondary p-3 shadow-sm border-2 rounded-4 bg-white mt-2 d-flex align-items-center w-100" onclick="app.selectDept('全部')">
            <div class="bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center me-3 shadow-sm" style="width: 48px; height: 48px; flex-shrink: 0;">
              <i class="bi bi-collection fs-4"></i>
            </div>
            <div class="text-start flex-grow-1">
              <span class="d-block fs-5 fw-bold text-dark">全部單位</span>
              <small class="text-muted fw-normal">載入所有單位與總覽</small>
            </div>
            <i class="bi bi-chevron-right text-secondary fs-4"></i>
        </button>`;
    } else {
        html = `<div class="d-flex flex-column align-items-center justify-content-center mt-5 p-5 bg-white rounded shadow-sm border-0" style="min-height: 50vh;">
                    <i class="bi bi-display text-primary mb-3" style="font-size: 5rem;"></i>
                    <h3 class="fw-bold text-dark mt-2">歡迎回來，${this.user.empName}</h3>
                    <p class="text-muted fs-5 mt-2">請從左側選單選擇您要執行的單位或系統總覽，系統將即時為您載入對應資料。</p>
                </div>`;
    }
    document.getElementById('mobile-dept-list').innerHTML = html;
  },

  async navTo(page, target) {
    if (target) this.setActiveMenu(target);
    if (page === 'dashboard') {
        await this.preloadData('全部');
        app.dashboard.loadDashboard(null);
    } else if (page === 'calendar') {
        await this.preloadData('全部');
        app.calendar.loadCalendar(null);
    } else if (page === 'admin_wf') {
        await this.preloadData('admin');
        app.admin.loadAdminWorkflows(null);
    } else if (page === 'admin_flow') {
        await this.preloadData('admin');
        app.admin.loadAdminFlows(null);
    } else if (page === 'admin_q') {
        await this.preloadData('admin');
        app.admin.loadAdminQuestions(null);
    }
  },

  async selectDept(dept, menuItem = null) {
    if (menuItem) app.setActiveMenu(menuItem);
    await this.preloadData(dept); 
    app.currentDept = dept === '全部' ? '' : dept;

    if (dept === '全部') {
        app.dashboard.loadDashboard();
    } else {
        app.department.loadDeptFlows(dept, null);
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
    const activeView = document.querySelector('.content-view.active').id;
    if(activeView === 'view-mobile-menu') this.loadHomeView();
    else if(activeView === 'view-dashboard') app.dashboard.loadDashboard();
    else if(activeView === 'view-dept-flows') app.department.loadDeptFlows(app.currentDept);
    else if(activeView === 'view-calendar') app.calendar.loadCalendar();
    else if(activeView === 'view-admin-workflows') app.admin.loadAdminWorkflows();
    else if(activeView === 'view-admin-flows') app.admin.loadAdminFlows();
    else if(activeView === 'view-admin-questions') app.admin.loadAdminQuestions();
  }
};
window.onload = () => app.init();
