app.dashboard = {
  charts: {},
  cachedData: null,
  cachedChartData: null, // ✅ 存放圖表資料，供篩選器使用

  async loadDashboard(menuItem = null) {
    if(menuItem) app.setActiveMenu(menuItem);
    app.switchView('view-dashboard', '系統總覽');
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    
    const cacheKey = `${startDate}_${endDate}_all`;
    let data;
    if (app.cache.dashboard[cacheKey]) {
        data = app.cache.dashboard[cacheKey];
    } else {
        data = await app.api({ action: 'getDashboard', startDate, endDate, department: '' });
        app.cache.dashboard[cacheKey] = data;
    }
    this.cachedData = data;

    // ✅ 同步抓取圖表資料 (一次抓完，讓前端自己瞬間過濾)
    const cacheKeyChart = `${startDate}_${endDate}_all_temp`;
    if (app.cache.dashboard[cacheKeyChart]) { 
        this.cachedChartData = app.cache.dashboard[cacheKeyChart]; 
    } else { 
        this.cachedChartData = await app.api({ action: 'getTempHistoryByDate', startDate, endDate, department: '' }); 
        app.cache.dashboard[cacheKeyChart] = this.cachedChartData; 
    }

    let deptSet = new Set(), wfSet = new Set();
    const addSets = (list) => {
        if(!list) return;
        list.forEach(item => {
            if(item.dept || item.flowDept) deptSet.add(item.dept || item.flowDept);
            if(item.name || item.wfName) wfSet.add(item.name || item.wfName);
        });
    };
    
    addSets(data.exceptionsList);
    addSets(data.incompleteWorkflows);
    addSets(data.incompletePeriodWorkflows);
    addSets(data.ondemandWorkflows);

    // ✅ 把圖表出現的單位與任務也加進下拉選單
    if (this.cachedChartData) {
        Object.values(this.cachedChartData).forEach(chart => {
            deptSet.add(chart.dept);
            wfSet.add(chart.wfName);
        });
    }

    this.updateDropdown('dash-filter-dept', '所有單位', deptSet);
    this.updateDropdown('dash-filter-wf', '所有任務', wfSet);

    // ✅ 呼叫過濾器 (裡面會同時處理清單與圖表的渲染)
    this.applyFilters();
  },

  updateDropdown(elId, defaultText, optionsSet) {
    let el = document.getElementById(elId); let currVal = el.value;
    el.innerHTML = `<option value="">${defaultText}</option>` + Array.from(optionsSet).sort().map(opt => `<option value="${opt}">${opt}</option>`).join('');
    el.value = currVal; 
  },

  applyFilters() {
    if (!this.cachedData) return;
    
    let filterDept = document.getElementById('dash-filter-dept').value;
    let filterWf = document.getElementById('dash-filter-wf').value;
    let data = this.cachedData;

    const checkFilter = (item) => {
       let d = item.dept || item.flowDept;
       let w = item.name || item.wfName;
       return (filterDept === '' || d === filterDept) && (filterWf === '' || w === filterWf);
    };

    let fExcsRaw = data.exceptionsList.filter(checkFilter);
    let fInc = data.incompleteWorkflows.filter(checkFilter);
    let fPer = (data.incompletePeriodWorkflows || []).filter(checkFilter);
    let fOnd = (data.ondemandWorkflows || []).filter(checkFilter);

    let groupedExcs = {};
    fExcsRaw.forEach(e => {
        if(!groupedExcs[e.recordId]) groupedExcs[e.recordId] = { ...e, anomalies: [] };
        groupedExcs[e.recordId].anomalies.push(`${e.qTitle}: ${e.value}`);
    });
    const uniqueExcs = Object.values(groupedExcs);
    
    let pendingExcs = uniqueExcs.filter(e => !e.approvalStatus || e.approvalStatus === '待處理');
    let resolvedExcs = uniqueExcs.filter(e => e.approvalStatus && e.approvalStatus !== '待處理');

    document.getElementById('dash-exc-count').innerText = pendingExcs.length;
    document.getElementById('dash-exc-res-count').innerText = resolvedExcs.length;

    const renderExcItem = (e, isResolved) => {
      let badgeHtml = '';
      if (isResolved) {
         let icon = e.approvalStatus === '已處理' ? 'bi-check-circle-fill text-success' : 'bi-x-octagon-fill text-danger';
         let color = e.approvalStatus === '已處理' ? 'success' : 'danger';
         badgeHtml = `<div class="text-dark small mt-2 p-2 bg-light border border-${color} border-2 rounded shadow-sm">
                         <div class="d-flex justify-content-between mb-1">
                           <span><i class="bi bi-person-fill text-primary"></i> <strong>簽核人：</strong>${e.approvalEmp || '未知'}</span>
                           <span class="text-${color} fw-bold"><i class="${icon}"></i> ${e.approvalStatus}</span>
                         </div>
                         <div><i class="bi bi-chat-text-fill text-secondary"></i> <strong>備註：</strong>${e.approvalMemo || '無'}</div>
                      </div>`;
      }
      
      let btnHtml = isResolved 
         ? `<button class="btn btn-sm btn-outline-primary fw-bold text-nowrap ms-2 shadow-sm" onclick="app.department.openForm('edit', '${e.flowId}', '${e.flowName}', '${e.recordId}')">查看紀錄</button>` 
         : `<button class="btn btn-sm btn-outline-danger fw-bold text-nowrap ms-2 shadow-sm" onclick="app.department.openForm('exception', '${e.flowId}', '${e.flowName}', '${e.recordId}')">處理異常</button>`;

      let borderClass = isResolved ? (e.approvalStatus === '已處理' ? 'border-success' : 'border-warning') : 'border-danger';

      return `
      <li class="mb-2 p-2 bg-white rounded shadow-sm border-start ${borderClass} border-4 d-flex justify-content-between align-items-center text-dark">
        <div style="max-width: 75%; width: 100%;">
          <span class="badge bg-light text-dark border me-1">${e.flowDept}</span>
          <span class="badge bg-info text-dark border me-1">${e.wfName || e.flowCategory || '例外紀錄'}</span>
          <strong class="fs-6">${e.flowName}</strong>
          <div class="text-muted small mt-1"><i class="bi bi-person"></i> ${e.empName} | <i class="bi bi-clock"></i> ${e.time}</div>
          <div class="text-danger small mt-1 fw-bold">${e.anomalies.join(' , ')}</div>
          ${badgeHtml}
        </div>
        <div>${btnHtml}</div>
      </li>`;
    };

    document.getElementById('dash-exc-list').innerHTML = pendingExcs.length > 0 ? pendingExcs.map(e => renderExcItem(e, false)).join('') : '<li class="p-2 text-muted fw-bold"><i class="bi bi-check-circle fs-5 me-2"></i> 目前區間符合條件之待處理異常為空！</li>';
    document.getElementById('dash-exc-res-list').innerHTML = resolvedExcs.length > 0 ? resolvedExcs.map(e => renderExcItem(e, true)).join('') : '<li class="p-2 text-muted fw-bold">尚無主管簽核紀錄。</li>';
      
    document.getElementById('dash-inc-count').innerText = fInc.length;
    document.getElementById('dash-period-count').innerText = fPer.length;
    document.getElementById('dash-ondemand-count').innerText = fOnd.length;

    document.getElementById('dash-inc-list').innerHTML = fInc.length > 0
      ? fInc.map(wf => `
        <li class="mb-2 p-2 bg-white rounded shadow-sm d-flex justify-content-between align-items-center border-start border-warning border-4">
          <div>
            <span class="badge bg-secondary border me-1 shadow-sm"><i class="bi bi-calendar"></i> ${wf.date}</span>
            <span class="badge bg-light text-dark border">${wf.dept}</span><span class="badge bg-info text-dark border ms-1">${wf.category}</span>
            <span class="badge bg-light text-secondary border ms-1">${wf.subCategory || '未次分類'}</span><span class="fw-bold ms-1 text-dark">${wf.name}</span>
          </div>
          <button class="btn btn-sm btn-primary fw-bold text-nowrap shadow-sm ms-2" onclick="app.department.startWorkflowFromCalendar('${wf.id}', '${wf.dept}', '${wf.date}')">補填</button>
        </li>`).join('')
      : '<li class="p-2 text-success fw-bold"><i class="bi bi-check-circle fs-5 me-2"></i> 區間內符合條件之任務已填寫完畢！</li>';

    document.getElementById('dash-period-list').innerHTML = (fPer && fPer.length > 0)
      ? fPer.map(wf => `
        <li class="mb-2 p-2 bg-white rounded shadow-sm d-flex justify-content-between align-items-center border-start border-warning border-4">
          <div>
            <span class="badge bg-secondary border me-1 shadow-sm"><i class="bi bi-calendar-range"></i> 本期</span>
            <span class="badge bg-light text-dark border">${wf.dept}</span><span class="badge bg-info text-dark border ms-1">${wf.category}</span>
            <span class="badge bg-light text-secondary border ms-1">${wf.subCategory || '未次分類'}</span><span class="fw-bold ms-1">${wf.name}</span>
          </div>
          <button class="btn btn-sm btn-primary fw-bold text-nowrap shadow-sm ms-2" onclick="app.department.startWorkflowFromCalendar('${wf.id}', '${wf.dept}', '${wf.date}')">啟動</button>
        </li>`).join('')
      : '<li class="p-2 text-success fw-bold"><i class="bi bi-check-circle fs-5 me-2"></i> 區間內無符合條件之待辦週期任務！</li>';

    document.getElementById('dash-ondemand-list').innerHTML = (fOnd && fOnd.length > 0)
      ? fOnd.map(wf => `
        <li class="mb-2 p-2 bg-white rounded shadow-sm d-flex justify-content-between align-items-center border-start border-success border-4">
          <div>
            <span class="badge bg-light text-dark border">${wf.dept}</span><span class="badge bg-success text-white border ms-1">${wf.category}</span>
            <span class="badge border border-success text-success ms-1">${wf.subCategory || '未次分類'}</span><span class="fw-bold ms-1">${wf.name}</span>
          </div>
          <button class="btn btn-sm btn-outline-success fw-bold text-nowrap shadow-sm ms-2" onclick="app.department.startWorkflowFromCalendar('${wf.id}', '${wf.dept}', '${wf.date}')">進入填寫</button>
        </li>`).join('')
      : '<li class="p-2 text-muted fw-bold">此區間無符合條件之常設任務。</li>';

    // ✅ 觸發圖表渲染
    this.renderCharts();
  },

  // ✅ 將原本 fetch 的邏輯分離，這裡只負責過濾與渲染
  renderCharts() {
    if (!this.cachedChartData) return;
    
    let filterDept = document.getElementById('dash-filter-dept').value;
    let filterWf = document.getElementById('dash-filter-wf').value;
    let data = this.cachedChartData;

    const container = document.getElementById('dash-charts');
    for(let qId in this.charts) { this.charts[qId].destroy(); }
    this.charts = {};

    // ✅ 過濾出符合單位與任務的圖表
    let filteredQIds = Object.keys(data).filter(qId => {
       let d = data[qId].dept;
       let w = data[qId].wfName;
       return (filterDept === '' || d === filterDept) && (filterWf === '' || w === filterWf);
    });

    if(filteredQIds.length === 0) { 
        container.innerHTML = '<div class="col-12"><p class="text-muted">指定區間內無符合條件之溫度紀錄資料。</p></div>'; 
        return; 
    }

    let html = '';
    filteredQIds.forEach(qId => {
        // ✅ 為圖表加上單位與任務的標籤，看起來更清楚
        html += `<div class="col-md-6 col-12 mb-4"><div class="card shadow-sm border-0"><div class="card-body">
                   <div class="mb-2">
                     <span class="badge bg-light text-dark border me-1">${data[qId].dept}</span>
                     <span class="badge bg-info text-dark border">${data[qId].wfName}</span>
                   </div>
                   <canvas id="dash-chart-${qId}"></canvas>
                 </div></div></div>`;
    });
    container.innerHTML = html; 

    setTimeout(() => {
      filteredQIds.forEach(qId => {
        let canvas = document.getElementById(`dash-chart-${qId}`);
        if(canvas) {
          let ctx = canvas.getContext('2d');
          this.charts[qId] = new Chart(ctx, {
            type: 'line', 
            data: { 
              labels: data[qId].data.map(d => d.time), 
              datasets: [{ label: data[qId].title, data: data[qId].data.map(d => d.value), borderColor: '#0d6efd', backgroundColor: 'rgba(13, 110, 253, 0.1)', fill: true, tension: 0.3 }] 
            },
            options: { responsive: true, plugins: { legend: { position: 'top' } } }
          });
        }
      });
    }, 100);
  }
};
