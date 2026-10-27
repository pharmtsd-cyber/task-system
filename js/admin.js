app.admin = {
  adminDataCache: null,

  async fetchAdminData() {
    if (!this.adminDataCache) { this.adminDataCache = await app.api({ action: 'getAdminData' }); }
    return this.adminDataCache;
  },

  filterList(event, containerId) {
    const term = event.target.value.toLowerCase();
    const items = document.querySelectorAll(`#${containerId} .sortable-item`);
    items.forEach(el => {
      const text = el.innerText.toLowerCase();
      el.style.display = text.includes(term) ? '' : 'none';
    });
  },

  initSortable(containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const options = { animation: 150, handle: '.drag-handle', ghostClass: 'bg-light', onEnd: () => this.saveSortOrder(type) };
    if (type === 'workflows') {
       const groups = container.querySelectorAll('.sortable-group');
       groups.forEach(group => new Sortable(group, options));
    } else { new Sortable(container, options); }
  },

  async saveSortOrder(type) {
    let items;
    if(type === 'workflows') items = document.querySelectorAll('#admin-workflows-list .sortable-item');
    else if(type === 'flows') items = document.querySelectorAll('#admin-flows-list .sortable-item');
    else items = document.querySelectorAll('#admin-questions-list .sortable-item');
    
    const ids = Array.from(items).map(el => el.dataset.id);
    let sheetName = type === 'workflows' ? 'Workflows' : (type === 'flows' ? 'Flows' : 'Questions');
    await app.api({ action: 'adminUpdateSort', sheetName: sheetName, idList: ids });
    this.adminDataCache = null; 
  },

  toggleSchUI() {
    let val = document.getElementById('aw-sch-type').value;
    document.getElementById('sch-weekday-ui').style.display = (val === 'WEEKDAY') ? 'block' : 'none';
    document.getElementById('sch-monthday-ui').style.display = (val === 'MONTHDAY') ? 'block' : 'none';
    document.getElementById('sch-period-ui').style.display = (val === 'PERIOD') ? 'block' : 'none';
  },

  // ---------------- 任務流 (Workflows) ----------------
  async loadAdminWorkflows(menuItem) {
    if(menuItem) app.setActiveMenu(menuItem);
    app.switchView('view-admin-workflows', '維護 任務流 (Workflows)');
    const data = await this.fetchAdminData();
    
    let html = `<div class="mb-3"><input type="text" class="form-control border-primary shadow-sm" placeholder="🔍 模糊搜尋 (輸入名稱、單位、分類或表單ID...)" onkeyup="app.admin.filterList(event, 'admin-workflows-list')"></div><div id="admin-workflows-list">`;
    let grouped = {};
    data.workflows.forEach(wf => { if(!grouped[wf.dept]) grouped[wf.dept] = []; grouped[wf.dept].push(wf); });

    for (let dept in grouped) {
      html += `<h5 class="fw-bold mt-4 text-primary"><i class="bi bi-building"></i> 單位：${dept || '通用/未指定'}</h5><div class="sortable-group">`;
      grouped[dept].forEach(wf => {
        let badge = wf.active ? `<span class="badge bg-success">啟用中</span>` : `<span class="badge bg-secondary">已停用</span>`;
        let schText = "每日";
        if (wf.schedule === 'ONDEMAND') schText = "🟢 隨時可填";
        else if (wf.schedule.startsWith('WEEKDAY')) schText = `星期 ${wf.schedule.split(':')[1]}`;
        else if (wf.schedule.startsWith('MONTHDAY')) schText = `每月 ${wf.schedule.split(':')[1]} 日`;
        else if (wf.schedule.startsWith('PERIOD')) {
           let v = wf.schedule.split(':')[1]; schText = v==='WEEK' ? '每週區間' : (v==='MONTH' ? '每月區間' : '每季區間');
        }
        let flowNames = wf.flowIds.split(',').map(id => {
            let f = data.flows.find(x => x.id === id.trim()); return f ? f.name : id;
        }).join(' ➡️ ');

        html += `
          <div class="card shadow-sm border-0 mb-2 border-start border-primary border-4 sortable-item" data-id="${wf.id}">
            <div class="card-body d-flex justify-content-between align-items-center py-2">
              <div class="d-flex align-items-center">
                <i class="bi bi-grip-vertical drag-handle text-muted me-3 fs-4" style="cursor: grab;" title="按住拖拉排序"></i>
                <div>
                  <div class="fw-bold fs-5 text-dark">${wf.name} <small class="text-muted fs-6">(${wf.id})</small></div>
                  <small class="text-muted">分類: ${wf.category} ｜ 綁定表單: <span class="text-primary fw-bold">${flowNames || '尚未綁定'}</span></small>
                  <div class="mt-1">${badge} <span class="badge bg-info text-dark ms-2"><i class="bi bi-calendar-check"></i> 頻率: ${schText}</span></div>
                </div>
              </div>
              <div>
                <button class="btn btn-sm btn-outline-primary shadow-sm" onclick='app.admin.adminEditWorkflow(${JSON.stringify(wf)})'><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger shadow-sm" onclick="app.admin.adminDelWorkflow('${wf.id}')"><i class="bi bi-trash"></i></button>
              </div>
            </div>
          </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
    document.getElementById('view-admin-workflows').querySelector('.list-container').innerHTML = html;
    this.initSortable('admin-workflows-list', 'workflows');
  },

  async adminEditWorkflow(wf = null) {
    const isNew = !wf; const data = await this.fetchAdminData();
    document.getElementById('adminModalTitle').innerText = isNew ? '新增任務流 (Workflow)' : '修改任務流 (Workflow)';
    let id = isNew ? `WF_${new Date().getTime()}` : wf.id;
    let sort = isNew ? 999 : wf.sort; let name = isNew ? '' : wf.name;
    let dept = isNew ? '' : wf.dept; let category = isNew ? '' : wf.category;
    let subCategory = isNew ? '' : (wf.subCategory || '');
    let flowIdsArray = isNew ? [] : wf.flowIds.split(',').map(s=>s.trim()); 
    let activeChecked = (!isNew && wf.active) || isNew ? 'checked' : '';

    let schType = 'DAILY', schVal = '';
    if (!isNew && wf.schedule) { let p = wf.schedule.split(':'); schType = p[0]; schVal = p[1] || ''; }
    let wdChecks = [1,2,3,4,5,6,7].map(d => {
       let checked = (schType === 'WEEKDAY' && schVal.split(',').includes(String(d))) ? 'checked' : '';
       let dName = ['一','二','三','四','五','六','日'][d-1];
       return `<div class="form-check form-check-inline"><input class="form-check-input wd-check" type="checkbox" value="${d}" ${checked}><label class="form-check-label">W${dName}</label></div>`;
    }).join('');

    let flowsChecklistHtml = data.flows.map(f => {
       let isChecked = flowIdsArray.includes(f.id) ? 'checked' : '';
       return `
         <div class="form-check border-bottom py-2">
           <input class="form-check-input flow-selector" type="checkbox" value="${f.id}" id="chk_${f.id}" ${isChecked}>
           <label class="form-check-label d-block" for="chk_${f.id}">
             <strong class="text-dark">${f.name}</strong> 
             <small class="text-muted ms-2">備註: ${f.memo || '無'}</small>
           </label>
         </div>`;
    }).join('');

    document.getElementById('adminModalBody').innerHTML = `
      <input type="hidden" id="aw-id" value="${id}"><input type="hidden" id="aw-sort" value="${sort}">
      <div class="mb-3"><label class="form-label fw-bold">任務名稱</label><input type="text" id="aw-name" class="form-control border-primary" value="${name}"></div>
      <div class="mb-3"><label class="form-label fw-bold">所屬單位</label><input type="text" id="aw-dept" class="form-control" value="${dept}" placeholder="通用 或 填寫單位名稱"></div>
      <div class="row mb-3">
        <div class="col-6"><label class="form-label fw-bold">主分類 (大標題)</label><input type="text" id="aw-cat" class="form-control" value="${category}" placeholder="如: 例行保養"></div>
        <div class="col-6"><label class="form-label fw-bold">次分類 (摺疊群組)</label><input type="text" id="aw-subcat" class="form-control" value="${subCategory}" placeholder="如: 空調系統"></div>
      </div>
      <div class="mb-3 p-3 bg-light rounded border border-info">
        <label class="form-label fw-bold text-dark"><i class="bi bi-clock-history"></i> 執行頻率設定</label>
        <select id="aw-sch-type" class="form-select mb-2" onchange="app.admin.toggleSchUI()">
          <option value="DAILY" ${schType==='DAILY'?'selected':''}>每日例行</option>
          <option value="WEEKDAY" ${schType==='WEEKDAY'?'selected':''}>指定星期 (如 W1, W4)</option>
          <option value="MONTHDAY" ${schType==='MONTHDAY'?'selected':''}>指定日期 (每月 N 號)</option>
          <option value="PERIOD" ${schType==='PERIOD'?'selected':''}>週期區間任務 (每週/月/季一次)</option>
          <option value="ONDEMAND" ${schType==='ONDEMAND'?'selected':''}>🟢 隨時可填 (不限期、無催繳通知)</option>
        </select>
        <div id="sch-weekday-ui" style="display:none;" class="mt-2 border-top pt-2">${wdChecks}</div>
        <div id="sch-monthday-ui" style="display:none;" class="mt-2 border-top pt-2"><label class="form-label small">輸入 1~31</label><input type="number" id="aw-md-val" class="form-control form-control-sm" value="${schType==='MONTHDAY'?schVal:''}" min="1" max="31"></div>
        <div id="sch-period-ui" style="display:none;" class="mt-2 border-top pt-2">
          <select id="aw-pd-val" class="form-select form-select-sm">
            <option value="WEEK" ${(schType==='PERIOD'&&schVal==='WEEK')?'selected':''}>每週一次</option>
            <option value="MONTH" ${(schType==='PERIOD'&&schVal==='MONTH')?'selected':''}>每月一次</option>
            <option value="QUARTER" ${(schType==='PERIOD'&&schVal==='QUARTER')?'selected':''}>每季一次</option>
          </select>
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label fw-bold"><i class="bi bi-ui-radios"></i> 勾選要包含的子表單 (依照勾選順序執行)</label>
        <div class="border border-primary rounded p-2 bg-white" style="max-height: 180px; overflow-y: auto;">
          ${flowsChecklistHtml || '<div class="text-muted small">目前還沒有任何表單，請先去建立表單。</div>'}
        </div>
      </div>
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="aw-active" ${activeChecked}><label class="form-check-label text-dark fw-bold">啟用此任務</label></div>
    `;
    this.toggleSchUI(); 

    document.getElementById('adminModalSaveBtn').onclick = async () => {
      let t = document.getElementById('aw-sch-type').value; let finalSch = 'DAILY';
      if(t === 'WEEKDAY') {
         let wds = Array.from(document.querySelectorAll('.wd-check:checked')).map(cb => cb.value).join(',');
         if(wds) finalSch = `WEEKDAY:${wds}`;
      } else if (t === 'MONTHDAY') {
         let md = document.getElementById('aw-md-val').value; if(md) finalSch = `MONTHDAY:${md}`;
      } else if (t === 'PERIOD') finalSch = `PERIOD:${document.getElementById('aw-pd-val').value}`;
      else if (t === 'ONDEMAND') finalSch = 'ONDEMAND';
      let selectedFlowIds = Array.from(document.querySelectorAll('.flow-selector:checked')).map(cb => cb.value).join(',');

      await app.api({ action: 'adminSaveWorkflow', data: { 
        id: document.getElementById('aw-id').value, name: document.getElementById('aw-name').value, sort: document.getElementById('aw-sort').value, 
        dept: document.getElementById('aw-dept').value, category: document.getElementById('aw-cat').value, subCategory: document.getElementById('aw-subcat').value, 
        flowIds: selectedFlowIds, schedule: finalSch, active: document.getElementById('aw-active').checked 
      }});
      this.adminDataCache = null; bootstrap.Modal.getInstance(document.getElementById('adminModal')).hide(); this.loadAdminWorkflows();
    };
    new bootstrap.Modal(document.getElementById('adminModal')).show();
  },

  async adminDelWorkflow(id) {
    if(!confirm("確定要刪除此任務流嗎？這不會刪除子表單，只會解除綁定關係。")) return;
    await app.api({ action: 'adminDeleteWorkflow', id: id });
    this.adminDataCache = null; this.loadAdminWorkflows();
  },

  // ---------------- 子表單 (Flows) 維護 ----------------
  async loadAdminFlows(menuItem) {
    if(menuItem) app.setActiveMenu(menuItem);
    app.switchView('view-admin-flows', '維護 問卷表單 (Forms)');
    const data = await this.fetchAdminData();
    let html = `<div class="mb-3"><input type="text" class="form-control border-info shadow-sm" placeholder="🔍 模糊搜尋 (輸入名稱、備註、被綁定的任務...)" onkeyup="app.admin.filterList(event, 'admin-flows-list')"></div><div id="admin-flows-list">`;
    
    data.flows.forEach(f => {
      let linkedWfs = data.workflows.filter(w => w.flowIds.split(',').map(s=>s.trim()).includes(f.id)).map(w => w.name).join('、 ');
      let badge = ''; let rawActive = String(f.active).toLowerCase();
      if (rawActive === '正常' || rawActive === 'true') badge = `<span class="badge bg-success">正常</span>`;
      else if (rawActive === '維修中') badge = `<span class="badge bg-warning text-dark">維修中</span>`;
      else badge = `<span class="badge bg-secondary">關閉</span>`;

      html += `
        <div class="card shadow-sm border-0 mb-2 border-start border-info border-4 sortable-item" data-id="${f.id}">
          <div class="card-body d-flex justify-content-between align-items-center py-2">
            <div class="d-flex align-items-center">
              <i class="bi bi-grip-vertical drag-handle text-muted me-3 fs-4" style="cursor: grab;" title="按住拖拉排序"></i>
              <div>
                <div class="fw-bold fs-5 text-dark">${f.name} <small class="text-muted fs-6">(${f.id})</small></div>
                <small class="text-muted"><i class="bi bi-diagram-2 text-info"></i> 綁定此表單的任務: <span class="text-dark fw-bold">${linkedWfs || '無'}</span></small><br>
                <!-- ✅ 加入填寫完成的次數統計 -->
                <small class="text-muted"><i class="bi bi-journal-text text-secondary"></i> 備註: ${f.memo || '無'} ｜ <i class="bi bi-check-circle-fill text-primary"></i> 完成筆數: <span class="fw-bold text-primary">${f.viewCount || 0}</span> 筆</small>
                <div class="mt-1">${badge}</div>
              </div>
            </div>
            <div>
              <button class="btn btn-sm btn-outline-primary shadow-sm" onclick='app.admin.adminEditFlow(${JSON.stringify(f)})'><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger shadow-sm" onclick="app.admin.adminDelFlow('${f.id}')"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>`;
    });
    html += `</div>`;
    document.getElementById('view-admin-flows').querySelector('.list-container').innerHTML = html;
    this.initSortable('admin-flows-list', 'flows');
  },

  async adminEditFlow(flow = null) {
    const isNew = !flow;
    document.getElementById('adminModalTitle').innerText = isNew ? '新增 表單' : '修改 表單';
    let id = isNew ? `FLOW_${new Date().getTime()}` : flow.id;
    let name = isNew ? '' : flow.name; let sort = isNew ? 999 : flow.sort;
    let memo = isNew ? '' : (flow.memo || '');
    let activeVal = isNew ? '正常' : String(flow.active).toLowerCase();
    if (activeVal === 'true') activeVal = '正常'; if (activeVal === 'false') activeVal = '關閉';

    document.getElementById('adminModalBody').innerHTML = `
      <input type="hidden" id="af-id" value="${id}"><input type="hidden" id="af-sort" value="${sort}">
      <div class="mb-3"><label class="form-label fw-bold">表單名稱</label><input type="text" id="af-name" class="form-control border-info" value="${name}"></div>
      <div class="mb-3"><label class="form-label fw-bold">備註 (內部註記)</label><input type="text" id="af-memo" class="form-control" value="${memo}"></div>
      <div class="mb-3"><label class="form-label fw-bold">表單啟用狀態</label>
        <select id="af-active" class="form-select">
          <option value="正常" ${activeVal==='正常'?'selected':''}>🟢 正常</option>
          <option value="維修中" ${activeVal==='維修中'?'selected':''}>🔧 維修中 (填表時預設關閉題目)</option>
          <option value="關閉" ${activeVal==='關閉'?'selected':''}>❌ 關閉 (完全停用)</option>
        </select>
      </div>
    `;
    document.getElementById('adminModalSaveBtn').onclick = async () => {
      await app.api({ action: 'adminSaveFlow', data: { id: document.getElementById('af-id').value, name: document.getElementById('af-name').value, sort: document.getElementById('af-sort').value, dept: '通用', memo: document.getElementById('af-memo').value, active: document.getElementById('af-active').value }});
      this.adminDataCache = null; bootstrap.Modal.getInstance(document.getElementById('adminModal')).hide(); this.loadAdminFlows();
    };
    new bootstrap.Modal(document.getElementById('adminModal')).show();
  },

  async adminDelFlow(id) {
    if(!confirm("確定要刪除嗎？建議先確認有無對應的題目與任務流綁定。")) return;
    await app.api({ action: 'adminDeleteFlow', id: id });
    this.adminDataCache = null; this.loadAdminFlows();
  },

  // ---------------- 題目 (Questions) 維護 ----------------
  async loadAdminQuestions(menuItem) {
    if(menuItem) app.setActiveMenu(menuItem);
    app.switchView('view-admin-questions', '設計問卷題目');
    const data = await this.fetchAdminData();
    let html = `<div class="mb-3"><input type="text" class="form-control border-dark shadow-sm" placeholder="🔍 模糊搜尋 (輸入題目、選項、所屬表單...)" onkeyup="app.admin.filterList(event, 'admin-questions-list')"></div><div id="admin-questions-list">`;
    
    data.questions.forEach(q => {
      let reqBadge = q.req ? `<span class="badge bg-danger ms-2">必填</span>` : '';
      let parentFlow = data.flows.find(fl => fl.id === q.flowId);
      let parentName = parentFlow ? parentFlow.name : "未知表單";

      html += `
        <div class="card shadow-sm border-0 mb-2 sortable-item" data-id="${q.id}">
          <div class="card-body d-flex justify-content-between align-items-center py-2">
            <div class="d-flex align-items-center">
              <i class="bi bi-grip-vertical drag-handle text-muted me-3 fs-4" style="cursor: grab;" title="按住拖拉排序"></i>
              <div>
                <div><span class="badge bg-primary me-2">${q.type}</span> <span class="fw-bold text-dark">${q.title}</span> ${reqBadge}</div>
                <small class="text-muted"><i class="bi bi-file-earmark-text text-dark"></i> 所屬表單: <span class="text-dark fw-bold">${parentName}</span> <span class="text-muted" style="font-size:0.8rem">(${q.flowId})</span></small><br>
                <small class="text-muted"><i class="bi bi-list-check text-secondary"></i> 選項: ${q.options || '無'} ｜ 備註: ${q.memo || '無'}</small>
              </div>
            </div>
            <div>
              <button class="btn btn-sm btn-outline-primary shadow-sm" onclick='app.admin.adminEditQuestion(${JSON.stringify(q)})'><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger shadow-sm" onclick="app.admin.adminDelQuestion('${q.id}')"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>`;
    });
    html += `</div>`;
    document.getElementById('view-admin-questions').querySelector('.list-container').innerHTML = html;
    this.initSortable('admin-questions-list', 'questions');
  },

  async adminEditQuestion(q = null) {
    const isNew = !q; const data = await this.fetchAdminData();
    document.getElementById('adminModalTitle').innerText = isNew ? '新增題目' : '修改題目';
    let id = isNew ? `Q_${new Date().getTime()}` : q.id;
    let flowId = isNew ? '' : q.flowId; let title = isNew ? '' : q.title;
    let type = isNew ? '單選' : q.type; let opts = isNew ? '' : q.options;
    let req = isNew ? false : q.req; let sort = isNew ? 999 : q.sort;
    let memo = isNew ? '' : (q.memo || '');
    let min = isNew ? '' : (q.min !== null && q.min !== undefined ? q.min : '');
    let max = isNew ? '' : (q.max !== null && q.max !== undefined ? q.max : '');
    let excCond = isNew ? '' : (q.excCond || ''); let hint = isNew ? '' : (q.hint || ''); let defVal = isNew ? '' : (q.defVal || '');

    let flowOptionsHtml = `<option value="">請選擇要綁定的表單...</option>` + data.flows.map(f => {
       let isSelected = flowId === f.id ? 'selected' : '';
       return `<option value="${f.id}" ${isSelected}>${f.name} (備註: ${f.memo || '無'})</option>`;
    }).join('');

    document.getElementById('adminModalBody').innerHTML = `
      <input type="hidden" id="aq-id" value="${id}"><input type="hidden" id="aq-sort" value="${sort}">
      <div class="mb-3">
        <label class="form-label fw-bold"><i class="bi bi-link-45deg"></i> 選擇所屬表單 (綁定目標)</label>
        <select id="aq-flow" class="form-select border-dark fw-bold text-dark">${flowOptionsHtml}</select>
      </div>
      <div class="mb-2"><label class="form-label fw-bold">題型</label>
        <select id="aq-type" class="form-select">
          <option ${type==='單選'?'selected':''}>單選</option><option ${type==='多選'?'selected':''}>多選</option>
          <option ${type==='文字'?'selected':''}>文字</option><option ${type==='數字'?'selected':''}>數字</option>
          <option ${type==='溫度'?'selected':''}>溫度</option><option ${type==='照片'?'selected':''}>照片</option>
          <option ${type==='標題'?'selected':''}>📌 標題/說明文字 (不需填寫)</option>
        </select>
      </div>
      <div class="mb-2"><label class="form-label fw-bold">題目名稱 / 標題</label><input type="text" id="aq-title" class="form-control border-primary" value="${title}"></div>
      <div class="mb-2"><label class="form-label fw-bold">提示說明文字 <span class="text-muted fw-normal">(選填)</span></label><textarea id="aq-hint" class="form-control" rows="2">${hint}</textarea></div>
      <div class="mb-2"><label class="form-label fw-bold">備註 (內部註記)</label><input type="text" id="aq-memo" class="form-control" value="${memo}"></div>
      <div class="mb-2"><label class="form-label fw-bold">選項 (單/多選專用，用逗號分隔)</label><input type="text" id="aq-opt" class="form-control" value="${opts}"></div>
      <div class="mb-3 p-3 bg-light border border-success rounded">
        <label class="form-label fw-bold text-success"><i class="bi bi-magic"></i> 預設代入值 (選填)</label>
        <input type="text" id="aq-defval" class="form-control" value="${defVal}">
      </div>
      <div class="p-3 bg-light border border-danger rounded mb-3">
        <label class="form-label fw-bold text-danger"><i class="bi bi-exclamation-triangle"></i> 異常觸發設定</label>
        <div class="row mb-2">
          <div class="col-6"><label class="form-label small fw-bold">正常值下限</label><input type="number" step="any" id="aq-min" class="form-control form-control-sm" value="${min}"></div>
          <div class="col-6"><label class="form-label small fw-bold">正常值上限</label><input type="number" step="any" id="aq-max" class="form-control form-control-sm" value="${max}"></div>
        </div>
        <div>
          <label class="form-label small fw-bold">觸發異常的關鍵字/選項</label>
          <input type="text" id="aq-exc-cond" class="form-control form-control-sm" value="${excCond}">
        </div>
      </div>
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="aq-req" ${req?'checked':''}><label class="form-check-label fw-bold text-danger">必填項目</label></div>
    `;
    
    document.getElementById('adminModalSaveBtn').onclick = async () => {
      let selectedFlowId = document.getElementById('aq-flow').value;
      if (!selectedFlowId) return alert('請選擇所屬表單！');
      await app.api({ action: 'adminSaveQuestion', data: { 
        id: document.getElementById('aq-id').value, flowId: selectedFlowId, sort: document.getElementById('aq-sort').value, 
        title: document.getElementById('aq-title').value, type: document.getElementById('aq-type').value, memo: document.getElementById('aq-memo').value, 
        options: document.getElementById('aq-opt').value, min: document.getElementById('aq-min').value, max: document.getElementById('aq-max').value, 
        req: document.getElementById('aq-req').checked, excCond: document.getElementById('aq-exc-cond').value, hint: document.getElementById('aq-hint').value, defVal: document.getElementById('aq-defval').value 
      }});
      this.adminDataCache = null; bootstrap.Modal.getInstance(document.getElementById('adminModal')).hide(); this.loadAdminQuestions();
    };
    new bootstrap.Modal(document.getElementById('adminModal')).show();
  },

  async adminDelQuestion(id) {
    if(!confirm("確定刪除嗎？")) return;
    await app.api({ action: 'adminDeleteQuestion', id: id });
    this.adminDataCache = null; this.loadAdminQuestions();
  }
};
