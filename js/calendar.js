app.calendar = {
  instance: null, cachedData: null,

  async loadCalendar(menuItem = null) {
    if(menuItem) app.setActiveMenu(menuItem);
    app.switchView('view-calendar', '行事曆總覽');
    
    let calendarEl = document.getElementById('calendar-container');
    if (!this.instance) {
      this.instance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', locale: 'zh-tw', height: 'auto',
        events: async (info, successCallback, failureCallback) => {
          try {
            const startDate = info.startStr.substring(0, 10); const endDate = info.endStr.substring(0, 10);
            const cacheKey = `${startDate}_${endDate}_all`;
            
            let data;
            if (app.cache.calendar[cacheKey]) data = app.cache.calendar[cacheKey];
            else { data = await app.api({ action: 'getCalendar', startDate, endDate, department: '' }); app.cache.calendar[cacheKey] = data; }
            this.cachedData = data;
            
            let deptSet = new Set(), wfSet = new Set();
            for(let date in data.days) data.days[date].details.forEach(d => { deptSet.add(d.dept); wfSet.add(d.wfName); });
            data.periodicTasks.forEach(d => { deptSet.add(d.dept); wfSet.add(d.wfName); });
            
            this.updateDropdown('cal-filter-dept', '所有單位', deptSet);
            this.updateDropdown('cal-filter-wf', '所有任務', wfSet);
            this.renderPeriodicBoard();

            let filterDept = document.getElementById('cal-filter-dept').value;
            let filterWf = document.getElementById('cal-filter-wf').value;
            
            let events = [];
            for(let dateStr in data.days) {
              let d = data.days[dateStr];
              let filteredDetails = d.details.filter(item => (filterDept === '' || item.dept === filterDept) && (filterWf === '' || item.wfName === filterWf));
              
              if (filteredDetails.length > 0) {
                let comp = filteredDetails.filter(x => x.status.includes('已填寫')).length;
                let incomp = filteredDetails.filter(x => x.status === '未填寫' || x.status === '部分填寫').length;
                
                // ✅ 雙色線條區分完成與未完成
                if (comp > 0) events.push({ start: dateStr, title: `✅ 已完成: ${comp}`, color: '#198754', extendedProps: { details: filteredDetails } });
                if (incomp > 0) events.push({ start: dateStr, title: `❌ 未填寫: ${incomp}`, color: '#dc3545', extendedProps: { details: filteredDetails } });
              }
            }
            successCallback(events);
          } catch(e) { failureCallback(e); }
        },
        eventClick: (info) => { this.renderDetails(info.event.startStr.substring(0, 10), info.event.extendedProps.details); }
      });
      this.instance.render();
    } else { this.instance.refetchEvents(); }
    document.getElementById('calendar-details-container').innerHTML = '<div class="text-muted mt-3">請點選上方行事曆有標記的日期，即可於此查看明細。</div>';
  },

  updateDropdown(elId, defaultText, optionsSet) {
    let el = document.getElementById(elId); let currVal = el.value;
    el.innerHTML = `<option value="">${defaultText}</option>` + Array.from(optionsSet).map(opt => `<option value="${opt}">${opt}</option>`).join('');
    el.value = currVal;
  },

  applyFilters() {
    if(this.instance) this.instance.refetchEvents();
    document.getElementById('calendar-details-container').innerHTML = '<div class="text-muted mt-3">資料已篩選，請重新點選上方日期查看明細。</div>';
  },

  renderPeriodicBoard() {
    let filterDept = document.getElementById('cal-filter-dept').value;
    let filterWf = document.getElementById('cal-filter-wf').value;
    let pTasks = this.cachedData.periodicTasks.filter(item => (filterDept === '' || item.dept === filterDept) && (filterWf === '' || item.wfName === filterWf));
    let board = document.getElementById('cal-period-board'); let listEl = document.getElementById('cal-period-list');
    
    if (pTasks.length === 0) { board.style.display = 'none'; return; }
    
    board.style.display = 'block';
    listEl.innerHTML = pTasks.map(t => {
      let badge = t.status === '未填寫' ? 'bg-secondary' : (t.status.includes('異常') ? 'bg-danger' : 'bg-success');
      let todayStr = document.getElementById('target-date').value;
      let jumpBtn = `<button class="btn btn-sm ${t.status === '未填寫' ? 'btn-primary' : 'btn-outline-primary'} fw-bold ms-2 shadow-sm" onclick="app.department.startWorkflowFromCalendar('${t.wfId}', '${t.dept}', '${todayStr}')">${t.status === '未填寫' ? '啟動任務' : '查看任務'}</button>`;
      
      return `<div class="list-group-item d-flex justify-content-between align-items-center py-3">
                <div><div class="fw-bold fs-6">${t.wfName} <span class="badge bg-light text-dark border ms-2">${t.dept}</span></div><small class="text-muted">${t.periodLabel}</small></div>
                <div class="d-flex align-items-center"><span class="badge ${badge} fs-6 shadow-sm">${t.status}</span>${jumpBtn}</div>
              </div>`;
    }).join('');
  },

  renderDetails(dateStr, details) {
    let html = `<h5 class="fw-bold mb-3 mt-4 border-bottom pb-2"><i class="bi bi-card-list"></i> ${dateStr} 任務狀態明細</h5>`;
    let groupedByDept = {};
    details.forEach(d => { if(!groupedByDept[d.dept]) groupedByDept[d.dept] = []; groupedByDept[d.dept].push(d); });

    let globalCatIndex = 0;

    for(let dept in groupedByDept) {
      html += `<h5 class="fw-bold text-dark mt-4 mb-3"><i class="bi bi-building"></i> 單位：${dept}</h5>`;
      let wfsForDept = groupedByDept[dept];

      let groupedByCat = {};
      wfsForDept.forEach(w => {
        let cat = w.category || '未分類';
        if(!groupedByCat[cat]) groupedByCat[cat] = [];
        groupedByCat[cat].push(w);
      });

      let sortedCategories = Object.keys(groupedByCat).sort();
      let uncategorizedHtml = ''; let categorizedHtml = '';

      sortedCategories.forEach(catName => {
        globalCatIndex++;
        let wfs = groupedByCat[catName];
        let subGroups = {};
        wfs.forEach(wf => {
          let sub = wf.subCategory || '未次分類';
          if(!subGroups[sub]) subGroups[sub] = [];
          subGroups[sub].push(wf);
        });

        let compCount = 0; let incCount = 0; let wfsHtml = '';

        let sortedSubCats = Object.keys(subGroups).sort();
        sortedSubCats.forEach((subCatName, subIdx) => {
          let subWfs = subGroups[subCatName];
          subWfs.sort((a,b) => a.sort - b.sort);

          let collapseId = `col-cal-sub-${globalCatIndex}-${subIdx}`;
          let subIncCount = subWfs.filter(w => w.status === '未填寫' || w.status === '部分填寫').length;
          let subCompCount = subWfs.filter(w => w.status.includes('已填寫')).length;
          let incBadgeClass = subIncCount > 0 ? 'bg-danger' : 'bg-secondary';

          let subWfsHtml = '';
          subWfs.forEach(wf => {
            let wfStatusBadge = ''; let jumpBtn = '';

            if (wf.isOnDemand) {
                wfStatusBadge = `<span class="badge bg-success shadow-sm fs-6">常設任務</span>`;
                jumpBtn = `<button class="btn btn-sm btn-outline-success fw-bold ms-2 shadow-sm" onclick="app.department.startWorkflowFromCalendar('${wf.wfId}', '${wf.dept}', '${dateStr}')">進入填寫</button>`;
                if (wf.status !== '未填寫') compCount++;
            } else if (wf.status.includes('已填寫')) {
                wfStatusBadge = `<span class="badge bg-success shadow-sm fs-6"><i class="bi bi-check"></i> 任務完成</span>`;
                jumpBtn = `<button class="btn btn-sm btn-outline-primary fw-bold ms-2 shadow-sm" onclick="app.department.startWorkflowFromCalendar('${wf.wfId}', '${wf.dept}', '${dateStr}')">查看任務</button>`;
                compCount++;
            } else {
                wfStatusBadge = `<span class="badge bg-secondary shadow-sm fs-6">未填寫</span>`;
                jumpBtn = `<button class="btn btn-sm btn-primary fw-bold ms-2 shadow-sm" onclick="app.department.startWorkflowFromCalendar('${wf.wfId}', '${wf.dept}', '${dateStr}')">啟動任務</button>`;
                incCount++;
            }

            let flowsHtml = `<div class="bg-light p-2 rounded border-0 mt-2">`;
            wf.flows.forEach(f => {
                let fBadge = `<span class="badge bg-secondary">未填寫</span>`;
                let actionBtn = ''; let empInfo = '尚未填寫';

                if (f.recordId) {
                    // ✅ 依據簽核結果顯示精準標籤
                    if (f.status === '維修中') fBadge = `<span class="badge bg-warning text-dark shadow-sm">維修中</span>`;
                    else if (f.status === '異常(已處理)') fBadge = `<span class="badge bg-success shadow-sm">異常(已處理)</span>`;
                    else if (f.status.includes('異常')) fBadge = `<span class="badge bg-danger shadow-sm">${f.status}</span>`;
                    else fBadge = `<span class="badge bg-success shadow-sm">正常</span>`;
                    
                    actionBtn = `<button class="btn btn-sm btn-outline-primary ms-2 bg-white" onclick="app.department.openForm('edit', '${f.flowId}', '${f.flowName}', '${f.recordId}')">查看</button>`;
                    empInfo = `${f.empName ? `<i class="bi bi-person text-primary"></i> ${f.empName} ｜ ` : ''}<i class="bi bi-clock"></i> ${f.time}`;
                }
                flowsHtml += `<div class="d-flex justify-content-between align-items-center py-2 border-bottom border-white"><div class="ms-1 ps-2 border-start border-3 border-secondary"><span class="fw-bold d-block text-dark">${f.flowName}</span><small class="text-muted">${empInfo}</small></div><div>${fBadge}${actionBtn}</div></div>`;
            });
            flowsHtml += `</div>`;

            subWfsHtml += `
              <div class="card shadow-sm border-0 mb-3 bg-white border-start border-primary border-4">
                <div class="card-body p-3">
                  <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                    <div class="fw-bold fs-5 text-dark"><i class="bi bi-play-circle-fill text-primary me-2"></i>${wf.wfName}</div>
                    <div class="d-flex align-items-center">${wfStatusBadge}${jumpBtn}</div>
                  </div>
                  ${flowsHtml}
                </div>
              </div>`;
          });

          if (subCatName === '未次分類' || subCatName === '') {
              wfsHtml += subWfsHtml;
          } else {
              wfsHtml += `
                <div class="accordion mb-3 shadow-sm border-0">
                  <div class="accordion-item border-0 rounded overflow-hidden">
                    <h2 class="accordion-header">
                      <button class="accordion-button collapsed bg-white text-dark py-3 border-bottom border-2 border-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                        <span class="fs-6 fw-bold text-secondary"><i class="bi bi-folder2-open me-2"></i>${subCatName}</span>
                        <!-- ✅ 加入綠色已完成標籤 -->
                        <div class="ms-auto me-2">
                           <span class="badge bg-success shadow-sm px-3 py-1 me-1">已完成: ${subCompCount}</span>
                           <span class="badge ${incBadgeClass} shadow-sm px-3 py-1">未填寫: ${subIncCount}</span>
                        </div>
                      </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse bg-light"><div class="accordion-body p-3">${subWfsHtml}</div></div>
                  </div>
                </div>`;
          }
        });

        if (catName === '未分類' || catName === '') {
            uncategorizedHtml += wfsHtml;
        } else {
            let catIncBadgeClass = incCount > 0 ? 'bg-danger' : 'bg-secondary';
            categorizedHtml += `
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
                    <div class="accordion-body p-3">${wfsHtml}</div>
                  </div>
                </div>
              </div>`;
        }
      });

      html += `<div class="ps-2 ms-1 border-start border-3 border-primary mb-4">` + uncategorizedHtml + categorizedHtml + `</div>`;
    }
    document.getElementById('calendar-details-container').innerHTML = html;
  }
};
