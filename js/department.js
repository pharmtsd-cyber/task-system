app.department = {
  charts: {},

  async loadDeptFlows(dept, menuItem = null) {
    if(menuItem) app.setActiveMenu(menuItem);
    app.currentDept = dept;
    app.switchView('view-dept-flows', `${dept} 任務清單`);
    
    // 若為手機模式，顯示返回按鈕
    if (document.body.classList.contains('mobile-mode')) {
        document.getElementById('mobile-back-btn').classList.remove('d-none');
    }

    const targetDate = document.getElementById('target-date').value;
    const cacheKey = `${dept}_${targetDate}`;
    let res;
    if (app.cache.deptFlows[cacheKey]) res = app.cache.deptFlows[cacheKey];
    else { res = await app.api({ action: 'getDeptFlows', department: dept, targetDate: targetDate }); app.cache.deptFlows[cacheKey] = res; }
    
    let groupedExcs = {};
    res.exceptionsList.forEach(e => {
        if(!groupedExcs[e.recordId]) groupedExcs[e.recordId] = { ...e, anomalies: [] };
        groupedExcs[e.recordId].anomalies.push(`${e.qTitle}: ${e.value}`);
    });
    const uniqueExcs = Object.values(groupedExcs);
    
    let pendingExcs = uniqueExcs.filter(e => !e.approvalStatus || e.approvalStatus === '待處理');
    let resolvedExcs = uniqueExcs.filter(e => e.approvalStatus && e.approvalStatus !== '待處理');

    document.getElementById('dept-exc-count').innerText = pendingExcs.length;
    document.getElementById('dept-exc-res-count').innerText = resolvedExcs.length;

    function renderExcItem(e, isResolved) {
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
    }

    document.getElementById('dept-exc-list').innerHTML = pendingExcs.length > 0 ? pendingExcs.map(e => renderExcItem(e, false)).join('') : '<li class="p-2 text-muted fw-bold"><i class="bi bi-check-circle fs-5 me-2"></i> 目前無待處理異常！</li>';
    document.getElementById('dept-exc-res-list').innerHTML = resolvedExcs.length > 0 ? resolvedExcs.map(e => renderExcItem(e, true)).join('') : '<li class="p-2 text-muted fw-bold">尚無主管簽核紀錄。</li>';

    document.getElementById('dept-inc-count').innerText = res.incompleteList.length;
    document.getElementById('dept-period-count').innerText = res.incompletePeriodList ? res.incompletePeriodList.length : 0;
    document.getElementById('dept-ondemand-count').innerText = res.ondemandList ? res.ondemandList.length : 0;

    document.getElementById('dept-inc-list').innerHTML = res.incompleteList.length > 0
      ? res.incompleteList.map(wf => `
        <li class="mb-2 p-2 bg-white rounded shadow-sm d-flex justify-content-between align-items-center border-start border-warning border-4">
          <div><span class="badge bg-light text-dark border">${wf.dept}</span><span class="badge bg-info text-dark border ms-1">${wf.category}</span><span class="badge bg-light text-secondary border ms-1">${wf.subCategory || '未次分類'}</span><span class="fw-bold ms-1">${wf.name}</span></div>
          <button class="btn btn-sm btn-primary fw-bold text-nowrap shadow-sm ms-2" onclick="app.department.startWorkflow('${wf.id}')">啟動</button>
        </li>`).join('')
      : '<li class="p-2 text-success fw-bold"><i class="bi bi-check-circle fs-5 me-2"></i> 本日指定任務全數填寫完畢！</li>';

    document.getElementById('dept-period-list').innerHTML = (res.incompletePeriodList && res.incompletePeriodList.length > 0) 
      ? res.incompletePeriodList.map(wf => `
        <li class="mb-2 p-2 bg-white rounded shadow-sm d-flex justify-content-between align-items-center border-start border-warning border-4">
          <div><span class="badge bg-light text-dark border">${wf.dept}</span><span class="badge bg-info text-dark border ms-1">${wf.category}</span><span class="badge bg-light text-secondary border ms-1">${wf.subCategory || '未次分類'}</span><span class="fw-bold ms-1">${wf.name}</span></div>
          <button class="btn btn-sm btn-primary fw-bold text-nowrap shadow-sm ms-2" onclick="app.department.startWorkflow('${wf.id}')">啟動</button>
        </li>`).join('')
      : '<li class="p-2 text-success fw-bold"><i class="bi bi-check-circle fs-5 me-2"></i> 本期無待辦週期任務！</li>';

    document.getElementById('dept-ondemand-list').innerHTML = (res.ondemandList && res.ondemandList.length > 0) 
      ? res.ondemandList.map(wf => `
        <li class="mb-2 p-2 bg-white rounded shadow-sm d-flex justify-content-between align-items-center border-start border-success border-4">
          <div><span class="badge bg-light text-dark border">${wf.dept}</span><span class="badge bg-success text-white border ms-1">${wf.category}</span><span class="badge border border-success text-success ms-1">${wf.subCategory || '未次分類'}</span><span class="fw-bold ms-1">${wf.name}</span></div>
          <button class="btn btn-sm btn-outline-success fw-bold text-nowrap shadow-sm ms-2" onclick="app.department.startWorkflow('${wf.id}')">進入填寫</button>
        </li>`).join('')
      : '<li class="p-2 text-muted fw-bold">無常設問卷。</li>';

    let html = '';
    let sortedCategories = Object.keys(res.categories).sort();
    
    if (sortedCategories.length === 0) {
        document.getElementById('dept-accordion-container').innerHTML = '<p class="text-muted mt-3">此單位尚未設定任務流。</p>';
        this.loadDeptCharts(dept, targetDate);
        return;
    }

    let globalCatIndex = 0;
    sortedCategories.forEach(catName => {
      globalCatIndex++;
      let wfs = res.categories[catName];
      let subGroups = {};
      wfs.forEach(wf => {
          let sub = wf.subCategory || '未次分類';
          if(!subGroups[sub]) subGroups[sub] = [];
          subGroups[sub].push(wf);
      });

      let sortedSubCats = Object.keys(subGroups).sort();
      let categorizedHtml = ''; let uncategorizedHtml = '';
      let compCount = 0; let incCount = 0;

      sortedSubCats.forEach((subCatName, subIdx) => {
          let subWfs = subGroups[subCatName];
          subWfs.sort((a,b) => a.sort - b.sort);

          let collapseId = `col-sub-${globalCatIndex}-${subIdx}`;
          let subIncCount = subWfs.filter(w => !w.isComplete && !w.isOnDemand && (w.isRequiredToday || w.isPeriod)).length;
          let subCompCount = subWfs.filter(w => w.isComplete && (!w.isOnDemand || w.flows.some(f => f.records.length > 0))).length;
          let incBadgeClass = subIncCount > 0 ? 'bg-danger' : 'bg-secondary';
          
          let wfsHtml = '';
          subWfs.forEach(wf => {
              let wfStatusBadge = ''; let jumpBtn = '';
              if (wf.isOnDemand) {
                  wfStatusBadge = `<span class="badge bg-success shadow-sm fs-6">常設任務</span>`;
                  jumpBtn = `<button class="btn btn-sm btn-outline-success fw-bold ms-2 shadow-sm" onclick="app.department.startWorkflow('${wf.id}')">進入填寫</button>`;
                  if (wf.isComplete && wf.flows.some(f => f.records.length > 0)) compCount++; 
              } else if (wf.isComplete) {
                  wfStatusBadge = `<span class="badge bg-success shadow-sm fs-6"><i class="bi bi-check"></i> 任務完成</span>`;
                  jumpBtn = `<button class="btn btn-sm btn-outline-primary fw-bold ms-2 shadow-sm" onclick="app.department.startWorkflow('${wf.id}')">查看任務</button>`;
                  compCount++;
              } else if (wf.isRequiredToday || wf.isPeriod) {
                  wfStatusBadge = `<span class="badge bg-secondary shadow-sm fs-6">未填寫</span>`;
                  jumpBtn = `<button class="btn btn-sm btn-primary fw-bold ms-2 shadow-sm" onclick="app.department.startWorkflow('${wf.id}')">啟動任務</button>`;
                  incCount++;
              } else {
                  wfStatusBadge = `<span class="badge bg-light text-dark border shadow-sm fs-6">今日免填</span>`;
                  jumpBtn = `<button class="btn btn-sm btn-outline-secondary fw-bold ms-2 shadow-sm" onclick="app.department.startWorkflow('${wf.id}')">查看任務</button>`;
              }

              let flowsHtml = `<div class="bg-light p-2 rounded border-0 mt-2">`;
              wf.flows.forEach(f => {
                  let fBadge = `<span class="badge bg-secondary">未填寫</span>`;
                  let actionBtn = ''; let empInfo = '尚未填寫';
                  if (f.records.length > 0) {
                      let r = f.records[0];
                      if (r.formStatus === '維修中') fBadge = `<span class="badge bg-warning text-dark shadow-sm">維修中</span>`;
                      else if (r.isException) {
                          if (r.approval) {
                              if (r.approval.result === '已處理') fBadge = `<span class="badge bg-success shadow-sm">異常(已處理)</span>`;
                              else fBadge = `<span class="badge bg-danger shadow-sm">異常(無法處理)</span>`;
                          } else {
                              fBadge = `<span class="badge bg-danger shadow-sm">異常(未處理)</span>`;
                          }
                      }
                      else fBadge = `<span class="badge bg-success shadow-sm">正常</span>`;
                      
                      actionBtn = `<button class="btn btn-sm btn-outline-primary ms-2 bg-white" onclick="app.department.openForm('edit', '${f.id}', '${f.name}', '${r.recordId}')">查看</button>`;
                      empInfo = `${r.empName ? `<i class="bi bi-person text-primary"></i> ${r.empName} ｜ ` : ''}<i class="bi bi-clock"></i> ${r.time}`;
                  }
                  flowsHtml += `<div class="d-flex justify-content-between align-items-center py-2 border-bottom border-white"><div class="ms-1 ps-2 border-start border-3 border-secondary"><span class="fw-bold d-block text-dark">${f.name}</span><small class="text-muted">${empInfo}</small></div><div>${fBadge}${actionBtn}</div></div>`;
              });
              flowsHtml += `</div>`;

              wfsHtml += `
                <div class="card shadow-sm border-0 mb-3 bg-white border-start border-primary border-4">
                  <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                      <div class="fw-bold fs-5 text-dark"><i class="bi bi-play-circle-fill text-primary me-2"></i>${wf.name}</div>
                      <div class="d-flex align-items-center">${wfStatusBadge}${jumpBtn}</div>
                    </div>
                    ${flowsHtml}
                  </div>
                </div>`;
          });

          if (subCatName === '未次分類' || subCatName === '') {
              categorizedHtml += wfsHtml;
          } else {
              categorizedHtml += `
                <div class="accordion mb-3 shadow-sm border-0">
                  <div class="accordion-item border-0 rounded overflow-hidden">
                    <h2 class="accordion-header">
                      <button class="accordion-button collapsed bg-white text-dark py-3 border-bottom border-2 border-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                        <span class="fs-6 fw-bold text-secondary"><i class="bi bi-folder2-open me-2"></i>${subCatName}</span>
                        <div class="ms-auto me-2">
                           <span class="badge bg-success shadow-sm px-3 py-1 me-1">已完成: ${subCompCount}</span>
                           <span class="badge ${incBadgeClass} shadow-sm px-3 py-1">未填寫: ${subIncCount}</span>
                        </div>
                      </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse bg-light"><div class="accordion-body p-3">${wfsHtml}</div></div>
                  </div>
                </div>`;
          }
      });

      if (catName === '未分類' || catName === '') {
          uncategorizedHtml += categorizedHtml;
      } else {
          let catIncBadgeClass = incCount > 0 ? 'bg-danger' : 'bg-secondary';
          html += `
            <div class="accordion mb-3 shadow-sm border-0" id="cat-acc-${globalCatIndex}">
              <div class="accordion-item border-0 rounded overflow-hidden">
                <h2 class="accordion-header">
                  <button class="accordion-button collapsed bg-white text-dark py-3 border-bottom border-2 border-primary" type="button" data-bs-toggle="collapse" data-bs-target="#cat-col-${globalCatIndex}">
                    <span class="fs-5 fw-bold text-primary"><i class="bi bi-folder2-open me-2"></i>${catName}</span>
                    <div class="ms-auto me-2">
                       <span class="badge bg-success shadow-sm me-1 px-3 py-2">已完成: ${compCount}</span>
                       <span class="badge ${catIncBadgeClass} shadow-sm px-3 py-2">未填寫: ${incCount}</span>
                    </div>
                  </button>
                </h2>
                <div id="cat-col-${globalCatIndex}" class="accordion-collapse collapse bg-light" data-bs-parent="#cat-acc-${globalCatIndex}">
                  <div class="accordion-body p-3">${categorizedHtml}</div>
                </div>
              </div>
            </div>`;
      }
    });

    document.getElementById('dept-accordion-container').innerHTML = html;

    // 針對手機版：隱藏圖表標題並跳過圖表渲染
    const chartTitle = document.querySelector('#view-dept-flows h5.fw-bold.text-secondary');
    if (document.body.classList.contains('mobile-mode')) {
        if(chartTitle) chartTitle.style.display = 'none';
        document.getElementById('dept-charts').innerHTML = ''; // 清空可能殘留的圖表
    } else {
        if(chartTitle) chartTitle.style.display = 'block';
        this.loadDeptCharts(dept, targetDate);
    }
  },

  async loadDeptCharts(dept, targetDate) {
    let endD = new Date(targetDate);
    let startD = new Date(endD);
    startD.setDate(startD.getDate() - 6); 
    
    let sY = startD.getFullYear();
    let sM = String(startD.getMonth() + 1).padStart(2, '0');
    let sD = String(startD.getDate()).padStart(2, '0');
    let startDateStr = `${sY}-${sM}-${sD}`;
    let endDateStr = targetDate;
    
    const cacheKey = `${dept}_${startDateStr}_${endDateStr}_temp`;
    let data;
    if (app.cache.deptFlows[cacheKey]) { 
        data = app.cache.deptFlows[cacheKey]; 
    } else { 
        data = await app.api({ action: 'getTempHistoryByDate', startDate: startDateStr, endDate: endDateStr, department: dept }); 
        app.cache.deptFlows[cacheKey] = data; 
    }

    const container = document.getElementById('dept-charts');
    for(let qId in this.charts) { this.charts[qId].destroy(); }
    this.charts = {};

    if(Object.keys(data).length === 0) { 
        container.innerHTML = '<div class="col-12"><p class="text-muted">此單位近期無溫度紀錄資料。</p></div>'; 
        return; 
    }

    let html = '';
    for(let qId in data) {
        html += `<div class="col-md-6 col-12 mb-4"><div class="card shadow-sm border-0"><div class="card-body">
                   <div class="mb-2">
                     <span class="badge bg-light text-dark border me-1">${data[qId].dept}</span>
                     <span class="badge bg-info text-dark border">${data[qId].qCategory}</span>
                   </div>
                   <canvas id="dept-chart-${qId}"></canvas>
                 </div></div></div>`;
    }
    container.innerHTML = html; 

    setTimeout(() => {
      for(let qId in data) {
        let canvas = document.getElementById(`dept-chart-${qId}`);
        if(canvas) {
          let ctx = canvas.getContext('2d');
          this.charts[qId] = new Chart(ctx, {
            type: 'line', 
            data: { 
                labels: data[qId].data.map(d => d.time), 
                datasets: [{ label: data[qId].title, data: data[qId].data.map(d => d.value), borderColor: '#198754', backgroundColor: 'rgba(25, 135, 84, 0.1)', fill: true, tension: 0.3 }] 
            },
            options: { responsive: true, plugins: { legend: { position: 'top' } } }
          });
        }
      }
    }, 100);
  },

  async startWorkflowFromCalendar(wfId, dept, dateStr) {
    document.getElementById('target-date').value = dateStr;
    await this.loadDeptFlows(dept);
    this.startWorkflow(wfId);
  },

  startWorkflow(wfId) {
    const targetDate = document.getElementById('target-date').value;
    const cacheKey = `${app.currentDept}_${targetDate}`;
    const res = app.cache.deptFlows[cacheKey];
    if(!res) return alert("資料尚未載入！");
    
    let targetWf = null;
    for (let cat in res.categories) {
        let found = res.categories[cat].find(w => w.id === wfId);
        if (found) targetWf = found;
    }
    if (!targetWf) return alert("找不到任務流資料！");

    let startIndex = 0;
    for (let i = 0; i < targetWf.flows.length; i++) {
        if (targetWf.flows[i].records && targetWf.flows[i].records.length > 0) startIndex = i + 1; 
        else break;
    }

    if (startIndex >= targetWf.flows.length) {
        if(confirm("此任務流本日已全數填寫完畢！是否要查看/修改最後一個表單？")) startIndex = targetWf.flows.length - 1;
        else return;
    }

    app.currentWorkflow = { id: targetWf.id, name: targetWf.name, flows: JSON.parse(JSON.stringify(targetWf.flows)), currentIndex: startIndex };
    this.openWorkflowStep();
  },

  openWorkflowStep() {
    let wf = app.currentWorkflow; let stepFlow = wf.flows[wf.currentIndex];
    let isEdit = stepFlow.records && stepFlow.records.length > 0;
    let recId = isEdit ? stepFlow.records[0].recordId : null;
    this.openForm(isEdit ? 'edit' : 'new', stepFlow.id, stepFlow.name, recId, true);
  },

  prevWorkflowStep() {
    if (app.currentWorkflow && app.currentWorkflow.currentIndex > 0) {
        app.currentWorkflow.currentIndex--; this.openWorkflowStep();
    }
  },

  toggleFormStatus(status) {
    const qc = document.getElementById('questions-container');
    if (status === '維修中') qc.style.display = 'none';
    else qc.style.display = 'block';
  },

  async openForm(mode, flowId, flowName, recordId = null, isWorkflow = false) {
    if(!isWorkflow) app.currentWorkflow = null;
    app.formMode = mode;
    app.currentFlow = { id: flowId, name: flowName, recordId: recordId };
    
    let isExcMode = mode === 'exception'; 
    let disableAttr = isExcMode ? 'disabled' : ''; 

    if (mode === 'new') app.api({ action: 'incrementCounter', type: 'FLOW', id: flowId }, true).catch(e=>console.error(e));

    app.switchView('view-form', `${app.currentWorkflow ? app.currentWorkflow.name + ' - ' : ''}資料讀取中...`);
    
    let res;
    if (app.cache.questions[flowId]) res = app.cache.questions[flowId];
    else { res = await app.api({ action: 'getQuestions', flowId: flowId }); app.cache.questions[flowId] = res; }
    
    app.questions = res.questions;
    app.currentFlow.name = res.flowName;
    let defaultFormStatus = res.flowStatus === '維修中' ? '維修中' : '正常';

    let progressText = '';
    if(app.currentWorkflow) progressText = ` <span class="badge bg-info text-dark fs-6 ms-2 shadow-sm border border-light">步驟 ${app.currentWorkflow.currentIndex + 1} / ${app.currentWorkflow.flows.length}</span>`;
    
    let titleModeText = mode === 'edit' ? '(查看紀錄)' : (isExcMode ? '(異常簽核)' : '');
    document.getElementById('page-main-title').innerHTML = `${app.currentWorkflow ? app.currentWorkflow.name + ' - ' : ''}${res.flowName} ${titleModeText} ${progressText}`;
    
    let oldAnswers = {};
    let currentFormStatus = defaultFormStatus;
    let oldApproval = null;
    
    if(mode === 'edit' || isExcMode) {
       const recData = await app.api({ action: 'getRecord', recordId: recordId });
       oldAnswers = recData.answers || {};
       if(recData.formStatus) currentFormStatus = recData.formStatus === '維修中' ? '維修中' : '正常';
       oldApproval = recData.approval; 
    }

    const container = document.getElementById('form-container');
    if (isExcMode) {
        container.innerHTML = `
          <div class="card mb-4 border-0 shadow-sm border-start border-warning border-4">
            <div class="card-body"><h5 class="fw-bold mb-0 text-dark"><i class="bi bi-gear-fill text-warning"></i> 表單狀態：${currentFormStatus} (唯讀)</h5></div>
          </div>
          <div id="questions-container"></div>`;
    } else {
        container.innerHTML = `
          <div class="card mb-4 border-0 shadow-sm border-start border-warning border-4">
            <div class="card-body">
              <h5 class="fw-bold mb-2 text-dark"><i class="bi bi-gear-fill text-warning"></i> 表單 (設備) 狀態</h5>
              <select id="form-status-toggle" class="form-select form-select-lg fw-bold" onchange="app.department.toggleFormStatus(this.value)">
                <option value="正常" ${currentFormStatus === '正常' ? 'selected' : ''}>🟢 設備正常 (須填表)</option>
                <option value="維修中" ${currentFormStatus === '維修中' ? 'selected' : ''}>🔧 維修中 (免填表直接儲存)</option>
              </select>
            </div>
          </div>
          <div id="questions-container"></div>`;
    }
    
    if (!isExcMode && oldApproval) {
        const viewAppCard = document.createElement('div');
        let icon = oldApproval.result === '已處理' ? 'bi-check-circle-fill text-success' : 'bi-x-octagon-fill text-danger';
        let bg = oldApproval.result === '已處理' ? 'border-success' : 'border-danger';
        let titleColor = oldApproval.result === '已處理' ? 'text-success' : 'text-danger';
        viewAppCard.innerHTML = `
          <div class="card mb-4 border-0 shadow-sm border-start ${bg} border-4 bg-light">
            <div class="card-body">
              <h5 class="fw-bold ${titleColor} mb-3"><i class="bi bi-shield-check"></i> 主管簽核結果</h5>
              <div class="row">
                  <div class="col-12 col-md-4 mb-2"><span class="badge bg-secondary fs-6 me-2">簽核人員</span> <span class="fw-bold text-dark">${oldApproval.empName || '未知'}</span></div>
                  <div class="col-12 col-md-4 mb-2"><span class="badge bg-secondary fs-6 me-2">狀態判定</span> <span class="fw-bold ${titleColor}"><i class="bi ${icon}"></i> ${oldApproval.result}</span></div>
                  <div class="col-12 col-md-4 mb-2"><span class="badge bg-secondary fs-6 me-2">處理時間</span> <span class="fw-bold text-dark">${oldApproval.time || ''}</span></div>
                  <div class="col-12 mt-2"><span class="badge bg-secondary fs-6 me-2">處理備註</span> <span class="text-dark fw-bold">${oldApproval.memo || '無'}</span></div>
              </div>
            </div>
          </div>`;
        document.getElementById('form-container').prepend(viewAppCard);
    }

    const qContainer = document.getElementById('questions-container');
    app.questions.forEach(q => {
      const ansData = oldAnswers[q.qId] || { value: '', isException: false };
      let val = ansData.value;
      const isExc = ansData.isException;
      
      if (mode === 'new' && val === '' && q.defVal) val = q.defVal;
      
      const hintHtml = q.hint ? `<div class="text-muted small mb-3"><i class="bi bi-info-circle"></i> ${q.hint.replace(/\n/g, '<br>')}</div>` : '';

      if (q.type.includes('標題')) {
         qContainer.innerHTML += `<div class="mb-4 mt-5 px-3 py-3 bg-light border-start border-primary border-4 shadow-sm rounded"><h4 class="fw-bold text-dark mb-0">${q.title}</h4>${q.hint ? `<div class="text-muted mt-2">${q.hint.replace(/\n/g, '<br>')}</div>` : ''}</div>`;
         return; 
      }

      const reqMark = q.isRequired ? `<span class="text-danger ms-1">*</span>` : '';
      const excBadge = isExc ? `<span class="badge bg-danger ms-2"><i class="bi bi-exclamation-triangle"></i> 異常狀態</span>` : '';
      const borderClass = isExc ? 'border border-danger border-3 shadow' : 'border-0 shadow-sm';

      let html = `<div class="card mb-4 ${borderClass}"><div class="card-body"><h5 class="fw-bold mb-1 text-dark">${q.title} ${reqMark} ${excBadge}</h5>${hintHtml}`;
      
      if(q.type === '單選') {
        q.options.forEach(opt => {
          const checked = val === opt ? 'checked' : '';
          html += `<div class="form-check mb-2"><input type="radio" name="${q.qId}" value="${opt}" class="form-check-input" ${checked} ${disableAttr}> <label class="form-check-label fs-5">${opt}</label></div>`;
        });
      } else if (q.type === '多選') {
        let valArr = val.split(',');
        q.options.forEach(opt => {
          const checked = valArr.includes(opt) ? 'checked' : '';
          html += `<div class="form-check mb-2"><input type="checkbox" name="${q.qId}" value="${opt}" class="form-check-input" ${checked} ${disableAttr}> <label class="form-check-label fs-5">${opt}</label></div>`;
        });
      } else if (q.type === '數字' || q.type === '溫度') {
        html += `<input type="number" step="any" id="${q.qId}" class="form-control form-control-lg bg-light border border-secondary shadow-sm" value="${val}" ${disableAttr}>`;
      } else if (q.type === '文字') {
        html += `<textarea id="${q.qId}" class="form-control form-control-lg bg-light border border-secondary shadow-sm" rows="3" placeholder="請輸入文字..." ${disableAttr}>${val}</textarea>`;
      } else if (q.type === '照片') {
        if((mode === 'edit' || isExcMode) && val.startsWith('http')) {
          html += `<div class="mb-2"><img src="${val}" class="img-fluid rounded shadow-sm" style="max-height:200px;"></div>`;
        }
        if (!isExcMode) html += `<small class="text-muted d-block mb-2">上傳新照將覆蓋</small><input type="file" accept="image/*" class="form-control form-control-lg border-secondary shadow-sm" id="${q.qId}">`;
      }
      html += `</div></div>`;
      qContainer.innerHTML += html;
    });

    if (!isExcMode) this.toggleFormStatus(currentFormStatus);

    if (isExcMode) {
        let preResult = oldApproval ? oldApproval.result : '已處理';
        let preMemo = oldApproval ? oldApproval.memo : '';
        const appCard = document.createElement('div');
        appCard.innerHTML = `
          <div class="card mb-4 border-0 shadow border-start border-danger border-4 bg-light">
            <div class="card-body">
              <h4 class="fw-bold text-danger mb-3"><i class="bi bi-pen-fill"></i> 異常處理簽核區</h4>
              <div class="mb-3">
                <label class="form-label fw-bold">處理人員 (自動帶入)</label>
                <input type="text" class="form-control bg-white fw-bold text-primary" value="${app.user.empId} - ${app.user.empName}" disabled>
              </div>
              <div class="mb-3">
                <label class="form-label fw-bold">處理結果判定</label>
                <select id="approval-result" class="form-select form-select-lg border-danger fw-bold text-danger">
                  <option value="已處理" ${preResult === '已處理' ? 'selected' : ''}>🟢 狀況排除 (已處理 / 結案)</option>
                  <option value="無法處理" ${preResult === '無法處理' ? 'selected' : ''}>🔴 無法處理 (需後續追蹤 / 詳見備註)</option>
                </select>
              </div>
              <div class="mb-0">
                <label class="form-label fw-bold">處理備註 / 後續建議 (無法處理時必填)</label>
                <textarea id="approval-memo" class="form-control border-danger" rows="3" placeholder="請詳細輸入目前的狀況與處置方式...">${preMemo}</textarea>
              </div>
            </div>
          </div>`;
        document.getElementById('form-container').appendChild(appCard);
    } 

    let btnHtml = '';
    if (isExcMode) {
        btnHtml += `<button class="btn btn-secondary flex-fill fw-bold shadow-sm py-2" onclick="app.department.goBack()"><i class="bi bi-box-arrow-left"></i> 取消返回</button>`;
        btnHtml += `<button class="btn btn-danger flex-fill fw-bold shadow-sm py-2 ms-2" onclick="app.department.submitApproval()"><i class='bi bi-check-lg'></i> 確認簽核</button>`;
    } else {
        if (isWorkflow && app.currentWorkflow.currentIndex > 0) btnHtml += `<button class="btn btn-outline-secondary flex-fill fw-bold shadow-sm py-2" onclick="app.department.prevWorkflowStep()"><i class="bi bi-arrow-left"></i> 上一頁</button>`;
        else btnHtml += `<button class="btn btn-secondary flex-fill fw-bold shadow-sm py-2" onclick="app.department.goBack()"><i class="bi bi-box-arrow-left"></i> 返回清單</button>`;
        if (mode === 'edit') btnHtml += `<button class="btn btn-danger flex-fill fw-bold shadow-sm py-2" onclick="app.department.deleteRecord()"><i class="bi bi-trash"></i> 刪除</button>`;
        let submitText = (isWorkflow && app.currentWorkflow.currentIndex < app.currentWorkflow.flows.length - 1) ? "儲存並下一步 <i class='bi bi-arrow-right'></i>" : "<i class='bi bi-check-lg'></i> 確認儲存";
        btnHtml += `<button class="btn btn-primary flex-fill fw-bold shadow-sm py-2" onclick="app.department.submitForm()">${submitText}</button>`;
    }
    document.getElementById('form-actions').innerHTML = btnHtml;
  },

  async submitApproval() {
     const result = document.getElementById('approval-result').value;
     const memo = document.getElementById('approval-memo').value;
     if (result === '無法處理' && !memo.trim()) return alert("⚠️ 判定為「無法處理」時，請務必在備註欄填寫原因！");

     app.showLoading(true);
     try {
        await app.api({ action: 'submitApproval', recordId: app.currentFlow.recordId, empId: app.user.empId, empName: app.user.empName, result: result, memo: memo });
        app.cache.dashboard = {}; app.cache.deptFlows = {}; app.cache.calendar = {};
        app.showLoading(false);
        alert("簽核成功！");
        this.goBack();
     } catch(e) {
        app.showLoading(false); alert("簽核失敗：" + e.message);
     }
  },

  goBack() { 
    if(app.currentDept) this.loadDeptFlows(app.currentDept);
    else if (document.body.classList.contains('mobile-mode')) app.loadMobileMenu();
    else app.dashboard.loadDashboard();
  },

  async deleteRecord() {
    if(!confirm("確定要刪除這筆紀錄嗎？刪除後無法還原。")) return;
    await app.api({ action: 'deleteRecord', recordId: app.currentFlow.recordId });
    app.cache.dashboard = {}; app.cache.deptFlows = {}; app.cache.calendar = {};
    alert("紀錄已刪除！");
    if(app.currentWorkflow) { app.currentWorkflow.flows[app.currentWorkflow.currentIndex].records = []; this.openWorkflowStep(); }
    else this.goBack();
  },

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader(); r.readAsDataURL(file);
      r.onload = () => resolve(r.result); r.onerror = e => reject(e);
    });
  },

  async submitForm() {
    let formStatus = document.getElementById('form-status-toggle').value;
    let answers = [];
    
    for (const q of app.questions) {
      if (q.type.includes('標題')) continue;
      let value = ""; let isException = false;
      let excConds = (q.excCond || "").split(',').map(s => s.trim()).filter(s => s !== "");

      if (q.type === '單選') {
        const c = document.querySelector(`input[name="${q.qId}"]:checked`);
        if(c) { value = c.value; if(excConds.includes(value)) isException = true; }
      } else if (q.type === '多選') {
        const c = document.querySelectorAll(`input[name="${q.qId}"]:checked`);
        if(c.length > 0) {
           let valArr = Array.from(c).map(cb => cb.value); value = valArr.join(',');
           if(valArr.some(v => excConds.includes(v))) isException = true;
        }
      } else if (q.type === '數字' || q.type === '溫度') {
        value = document.getElementById(q.qId).value;
        if (value !== "") {
          const numVal = Number(value);
          if ((q.min !== null && numVal < q.min) || (q.max !== null && numVal > q.max)) isException = true;
        }
      } else if (q.type === '文字') {
        value = document.getElementById(q.qId).value;
        if (value !== "" && excConds.length > 0) { if (excConds.some(kw => value.includes(kw))) isException = true; }
      } else if (q.type === '照片') {
        const fileInput = document.getElementById(q.qId);
        if (fileInput && fileInput.files.length > 0) value = await this.fileToBase64(fileInput.files[0]);
        else if (app.formMode === 'edit') {
          const existingImg = fileInput ? fileInput.parentElement.querySelector('img') : null;
          if (existingImg) value = existingImg.src;
        }
      }
      
      if (formStatus === '維修中') { value = ""; isException = false; } 
      else { if (q.isRequired && value === "") return alert(`請填寫必填項目：${q.title}`); }
      
      answers.push({ qId: q.qId, value: value, isException: isException });
    }

    const payload = { action: 'submitForm', empId: app.user.empId, flowId: app.currentFlow.id, answers: answers, recordId: app.formMode === 'edit' ? app.currentFlow.recordId : null, formStatus: formStatus };
    app.cache.dashboard = {}; app.cache.deptFlows = {}; app.cache.calendar = {};

    const isWorkflow = app.currentWorkflow !== null;
    const isLastStep = isWorkflow ? (app.currentWorkflow.currentIndex >= app.currentWorkflow.flows.length - 1) : true;

    if (isLastStep) {
        app.showLoading(true);
        app.api(payload).then(res => {
            app.showLoading(false);
            if (res.exceptionTriggered && formStatus !== '維修中') alert("儲存成功！注意：有異常數值，已通報處理。");
            else alert(isWorkflow ? "✅ 任務流全數填寫完畢！" : "儲存成功！");
            app.department.goBack();
        }).catch(err => { app.showLoading(false); alert("系統錯誤，存檔失敗: " + err.message); });
    } else {
        let savedWf = app.currentWorkflow; let savedIndex = app.currentWorkflow.currentIndex;
        app.api(payload, true).then(res => {
            savedWf.flows[savedIndex].records = [{ recordId: res.recordId }];
            if (res.exceptionTriggered && formStatus !== '維修中') alert("⚠️ 系統提示：剛剛送出的表單包含異常數值，已記錄。");
        }).catch(err => console.error("背景儲存失敗", err));
        app.currentWorkflow.currentIndex++; this.openWorkflowStep(); 
    }
  }
};
