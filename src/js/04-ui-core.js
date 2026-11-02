// Generic table, entity dialogs, router.
function mountTable(host, cfg) {
  const st = (UI.tbl[cfg.id] ??= { q: '', sort: cfg.defaultSort || null, page: 0, f: {}, sel: new Set(), size: cfg.pageSize || 50 });
  let hidden;
  try { const sv = JSON.parse(localStorage.getItem('lt-cols-' + cfg.id) || 'null'); hidden = new Set(sv || cfg.cols.filter(c => c.hidden).map(c => c.k)); } catch { hidden = new Set(); }
  const search = cfg.searchText || (r => cfg.cols.map(c => c.val ? c.val(r) : '').join(' '));
  host.innerHTML = `<div class="tbl-bar"><input type="search" placeholder="Search…" value="${esc(st.q)}" data-q>
    ${(cfg.filters || []).map(f => `<select data-f="${f.k}" title="${esc(f.label)}"><option value="">${esc(f.label)}: all</option>${optionsHTML(f.options(), st.f[f.k])}</select>`).join('')}
    <span class="spacer"></span><span class="muted small" data-count></span>
    <div class="dd"><button class="btn sm" data-dd>${ic('sliders')} Views</button><div class="dd-menu" data-views></div></div>
    <div class="dd"><button class="btn sm" data-dd>${ic('columns')} Columns</button><div class="dd-menu">${cfg.cols.filter(c => c.label).map(c => `<label><input type="checkbox" data-col="${c.k}"${hidden.has(c.k) ? '' : ' checked'}> ${esc(c.label)}</label>`).join('')}</div></div>
    <button class="btn sm" data-csv>${ic('download')} Export</button></div>
    <div data-bulk></div><div class="tbl-wrap"></div><div class="tbl-pager"></div>`;
  const wrap = $('.tbl-wrap', host), pager = $('.tbl-pager', host);
  const VK = 'lt-views-' + cfg.id, loadViews = () => { try { return JSON.parse(localStorage.getItem(VK) || '[]'); } catch { return []; } };
  const drawViews = () => { const v = loadViews(); $('[data-views]', host).innerHTML = `<div class="dh">Saved views (this computer)</div>${v.map((x, i) => `<div style="display:flex"><button data-vapply="${i}">${esc(x.name)}</button><button data-vdel="${i}" style="width:auto" title="Delete">×</button></div>`).join('') || '<div class="small muted" style="padding:4px 10px">None yet</div>'}<button data-vsave>${ic('plus')} Save current view…</button>`; };
  drawViews();
  const filtered = () => {
    let rows = cfg.rows();
    if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter(r => search(r).toLowerCase().includes(q)); }
    for (const f of cfg.filters || []) if (st.f[f.k]) rows = rows.filter(r => f.test(r, st.f[f.k]));
    if (st.sort) { const c = cfg.cols.find(c => c.k === st.sort.k); if (c) rows = [...rows].sort((a, b) => cmp(c.val(a), c.val(b)) * (st.sort.dir === 'desc' ? -1 : 1)); }
    return rows;
  };
  const draw = () => {
    const cols = cfg.cols.filter(c => !hidden.has(c.k));
    const rows = filtered(), size = st.size, pages = Math.max(1, Math.ceil(rows.length / size)); st.page = Math.min(st.page, pages - 1);
    const view = rows.slice(st.page * size, (st.page + 1) * size);
    $('[data-count]', host).textContent = `${fmtNum(rows.length)} row${rows.length === 1 ? '' : 's'}`;
    const bulk = $('[data-bulk]', host);
    if (cfg.bulk && st.sel.size) { bulk.innerHTML = `<div class="bulk edit-only"><b>${st.sel.size} selected</b>${cfg.bulk.map((b, i) => `<button class="btn sm" data-bulkfn="${i}">${esc(b.label)}</button>`).join('')}<button class="btn sm ghost" data-clear>Clear</button></div>`; } else bulk.innerHTML = '';
    if (!rows.length) { wrap.innerHTML = `<div class="empty">${esc(cfg.empty || 'Nothing to show.')}</div>`; pager.innerHTML = ''; return; }
    const allSel = view.length && view.every(r => st.sel.has(cfg.rowId(r)));
    wrap.innerHTML = `<table><thead><tr>${cfg.selectable ? `<th><input type="checkbox" data-selall${allSel ? ' checked' : ''}></th>` : ''}${cols.map(c => `<th class="${c.num ? 'num' : ''}${st.sort?.k === c.k ? ' sorted' + (st.sort.dir === 'desc' ? ' desc' : '') : ''}" ${c.val ? `data-sort="${c.k}"` : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${view.map(r => { const id = cfg.rowId(r); return `<tr data-id="${esc(id)}">${cfg.selectable ? `<td><input type="checkbox" data-sel="${esc(id)}"${st.sel.has(id) ? ' checked' : ''}></td>` : ''}${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(c.val(r) ?? '')}</td>`).join('')}</tr>`; }).join('')}</tbody>
      ${cfg.foot ? `<tfoot><tr>${cfg.selectable ? '<td></td>' : ''}${cols.map(c => `<td class="${c.num ? 'num' : ''}">${cfg.foot(c, rows) ?? ''}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
    const from = st.page * size + 1;
    pager.innerHTML = `<span>Showing ${fmtNum(from)}–${fmtNum(Math.min(rows.length, from + size - 1))} of ${fmtNum(rows.length)}</span><span class="spacer"></span><label>Rows <select data-size>${[25, 50, 100, 250].map(n => `<option${n === size ? ' selected' : ''}>${n}</option>`).join('')}</select></label>${pages > 1 ? `<button class="btn sm" data-pg="-1"${st.page === 0 ? ' disabled' : ''}>Prev</button> Page ${st.page + 1} / ${pages} <button class="btn sm" data-pg="1"${st.page >= pages - 1 ? ' disabled' : ''}>Next</button>` : ''}`;
  };
  host.addEventListener('input', e => { if (e.target.matches('[data-q]')) { st.q = e.target.value; st.page = 0; draw(); } });
  host.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-f]')) { st.f[t.dataset.f] = t.value; st.page = 0; draw(); }
    else if (t.matches('[data-size]')) { st.size = +t.value; st.page = 0; draw(); }
    else if (t.matches('[data-col]')) { t.checked ? hidden.delete(t.dataset.col) : hidden.add(t.dataset.col); try { localStorage.setItem('lt-cols-' + cfg.id, JSON.stringify([...hidden])); } catch { } draw(); }
    else if (t.matches('[data-sel]')) { t.checked ? st.sel.add(t.dataset.sel) : st.sel.delete(t.dataset.sel); draw(); }
    else if (t.matches('[data-selall]')) { filtered().slice(st.page * st.size, (st.page + 1) * st.size).forEach(r => t.checked ? st.sel.add(cfg.rowId(r)) : st.sel.delete(cfg.rowId(r))); draw(); }
  });
  host.addEventListener('click', e => {
    const t = e.target;
    const vs = t.closest('[data-vsave]'), va = t.closest('[data-vapply]'), vd = t.closest('[data-vdel]');
    if (vs) { const name = prompt('Name this view'); if (name) { const v = loadViews(); v.push({ name, q: st.q, f: { ...st.f }, sort: st.sort }); try { localStorage.setItem(VK, JSON.stringify(v)); } catch { } drawViews(); toast('View saved'); } return; }
    if (va) { const x = loadViews()[+va.dataset.vapply]; st.q = x.q; st.f = { ...x.f }; st.sort = x.sort; st.page = 0; $('[data-q]', host).value = st.q; $$('[data-f]', host).forEach(s => s.value = st.f[s.dataset.f] || ''); draw(); $$('.dd.open').forEach(d => d.classList.remove('open')); return; }
    if (vd) { const v = loadViews(); v.splice(+vd.dataset.vdel, 1); try { localStorage.setItem(VK, JSON.stringify(v)); } catch { } drawViews(); return; }
    if (t.closest('.dd-menu')) return;
    if (t.closest('[data-sort]')) { const k = t.closest('[data-sort]').dataset.sort; st.sort = st.sort?.k === k ? (st.sort.dir === 'asc' ? { k, dir: 'desc' } : null) : { k, dir: 'asc' }; draw(); return; }
    if (t.closest('[data-pg]')) { st.page += +t.closest('[data-pg]').dataset.pg; draw(); return; }
    if (t.closest('[data-csv]')) { download((cfg.csvName || cfg.id) + '.csv', toCSV([cfg.cols.filter(c => c.label).map(c => c.label), ...filtered().map(r => cfg.cols.filter(c => c.label).map(c => c.csv ? c.csv(r) : c.val ? c.val(r) : ''))])); return; }
    if (t.closest('[data-clear]')) { st.sel.clear(); draw(); return; }
    const bb = t.closest('[data-bulkfn]'); if (bb) { cfg.bulk[+bb.dataset.bulkfn].fn([...st.sel], () => { st.sel.clear(); }); return; }
    if (t.closest('input,button,a,select,label')) return;
    const tr = t.closest('tr[data-id]'); if (tr && cfg.onRow) cfg.onRow(tr.dataset.id);
  });
  draw();
}

// ---------- entity dialogs ----------
const LAB_TYPES = ['Computer lab', 'Classroom', 'Studio', 'Library', 'Testing center', 'Office', 'Cart / mobile', 'Other'];
const dlModels = () => `<datalist id="dl-models">${DB.data.models.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist><datalist id="dl-os">${['Windows 11', 'Windows 10', 'macOS Tahoe 26', 'macOS Sequoia 15', 'macOS Sonoma 14', 'macOS Ventura 13'].map(o => `<option value="${o}">`).join('')}</datalist>`;

const SCHEMA = {
  building: { title: 'Building', table: 'buildings', fields: [{ k: 'name', label: 'Name', req: true }, { k: 'code', label: 'Short code', help: 'e.g. SMI – used when matching device names to rooms' }, { k: 'aliases', label: 'Other names used in device names', wide: true, help: 'Comma-separated, e.g. SMITH, SH, SmithHall' }, { k: 'notes', label: 'Notes', type: 'textarea', wide: true }],
    remove(rec) { const n = DB.data.labs.filter(l => l.buildingId === rec.id).length; if (n) { toast(`${n} lab(s) still use this building – move or delete them first`, 'err'); return false; } DB.remove('buildings', rec.id); }
  },
  lab: {
    title: 'Lab', table: 'labs', defaults: () => ({ status: 'Active', type: 'Computer lab' }),
    fields: [
      { k: 'buildingId', label: 'Building', type: 'select', req: true, options: buildingOptions }, { k: 'room', label: 'Room', req: true },
      { k: 'name', label: 'Lab name' }, { k: 'department', label: 'Department / owner' },
      { k: 'type', label: 'Type', type: 'select', options: LAB_TYPES, req: true }, { k: 'baselineId', label: 'Software baseline', type: 'select', options: () => DB.data.baselines.map(b => ({ v: b.id, l: b.name })) }, { k: 'seats', label: 'Seats / stations', type: 'number', min: 0 }, { k: 'labStatsCount', label: 'Stations in LabStats', type: 'number', min: 0 },
      { k: 'status', label: 'Status', type: 'select', options: ['Active', 'Planned', 'Closed'], req: true },
      { k: 'match', label: 'Device-match keywords', wide: true, help: 'Comma-separated text found in device names / Mosyle tags / LabStats groups for this lab, e.g. SMI204, Smith-204. Imports use this to link devices to the room.' },
      { k: 'contactIds', label: 'Contacts for this lab', type: 'multi', wide: true, options: contactOptions },
      { k: 'notes', label: 'Notes', type: 'textarea', wide: true }]
  },
  model: {
    title: 'Model / configuration', table: 'models', wide: true, defaults: () => ({ category: 'Desktop', platform: 'Windows' }),
    fields: [
      { k: 'name', label: 'Model & configuration name', req: true, wide: true, help: 'e.g. Dell OptiPlex 7020 SFF – 16 GB / 512 GB. Make one entry per configuration you buy.' },
      { k: 'family', label: 'Model family', help: 'Groups configurations, e.g. Dell OptiPlex 7020' }, { k: 'category', label: 'Category', type: 'select', options: ['Desktop', 'Laptop', 'All-in-one', 'Workstation', 'Tablet', 'Other'] },
      { k: 'manufacturer', label: 'Manufacturer' }, { k: 'platform', label: 'Platform', type: 'select', options: PLATFORMS, req: true },
      { k: 'cpu', label: 'Processor' }, { k: 'gpu', label: 'Graphics' },
      { k: 'ramGB', label: 'RAM (GB)', type: 'number', min: 0 }, { k: 'storageGB', label: 'Storage (GB)', type: 'number', min: 0, help: '512, 1000 (1 TB)…' },
      { k: 'storageType', label: 'Storage type', type: 'select', options: ['SSD', 'NVMe SSD', 'HDD', 'Hybrid'] }, { k: 'os', label: 'Default OS', list: 'dl-os' }, { k: 'osUpgradable', label: 'Can upgrade OS?', type: 'select', options: ['Yes', 'No'], help: '“No” = hardware can’t run the current Windows/macOS' },
      { k: 'unitCost', label: 'Estimated unit cost', type: 'number', min: 0, help: 'Used for every line item that has no cost of its own' },
      { k: 'lifecycleYears', label: 'Lifecycle (years)', type: 'number', min: 0, step: '0.5', help: 'Blank = platform default from Settings' },
      { k: 'warrantyYears', label: 'Standard warranty (years)', type: 'number', min: 0, step: '0.5' }, { k: 'partNumber', label: 'Part / SKU number' },
      { k: 'notes', label: 'Notes (accessories, imaging notes…)', type: 'textarea', wide: true }],
    extra: () => dlModels()
  },
  hardware: {
    title: 'Hardware line', table: 'hardware', wide: true, defaults: () => ({ qty: 1, status: 'In service' }),
    fields: [
      { k: 'labId', label: 'Lab', type: 'select', req: true, options: labOptions }, { k: 'modelText', label: 'Model', req: true, list: 'dl-models', help: 'Pick from the catalog or type a new one' },
      { k: 'platform', label: 'Platform', type: 'select', options: PLATFORMS, req: true }, { k: 'qty', label: 'Quantity', type: 'number', min: 0, req: true },
      { k: 'unitCost', label: 'Unit cost (override)', type: 'number', min: 0 }, { k: 'status', label: 'Status', type: 'select', options: ['In service', 'Spare', 'Retired'], req: true },
      { k: 'os', label: 'Operating system', list: 'dl-os' }, { k: 'osVersion', label: 'OS version / build' },
      { k: 'purchaseDate', label: 'Purchase date', type: 'date' }, { k: 'lastReplaced', label: 'Last replacement date', type: 'date' },
      { k: 'lifecycleYears', label: 'Lifecycle years (override)', type: 'number', min: 0, step: '0.5' }, { k: 'plannedOverride', label: 'Planned replacement (override)', type: 'date', help: 'Blank = last replacement + lifecycle' },
      { k: 'fundingSource', label: 'Purchased with', type: 'select', options: fundingOptions, help: 'e.g. Replacement budget or a Tech fee project' }, { k: 'fundingRef', label: 'Project / PO number' },
      { k: 'docLinks', label: 'Links to quote / PO / invoice (one per line)', type: 'textarea', wide: true, rows: 2 },
      { k: 'warrantyEnd', label: 'Warranty expires', type: 'date' }, { k: 'enrollment', label: 'Management', type: 'select', options: ['Intune', 'Mosyle', 'Both', 'Unmanaged'] },
      { k: 'replacementPO', label: 'Replacement PO #' }, { k: 'refreshStatus', label: 'Refresh status', help: 'e.g. Planned, Quoted, Ordered, Complete' },
      { k: 'complianceAssetId', label: 'Compliance asset ID' }, { k: 'physicalCount', label: 'Physical count (last verified)', type: 'number', min: 0 }, { k: 'serviceNowCount', label: 'ServiceNow count', type: 'number', min: 0 },
      { k: 'plannedFunding', label: 'Planned replacement funding', type: 'select', options: fundingOptions, help: 'Blank = Replacement budget' },
      { k: 'notes', label: 'Notes', type: 'textarea', wide: true }],
    extra: v => dlModels() + `<div class="field wide"><div class="help" id="hw-calc"></div>${(v.history || []).length ? `<div class="help"><b>Replacement history:</b> ${v.history.map(h => `${fmtDate(h.date)} – ${esc(h.model)} × ${h.qty}`).join('; ')}</div>` : ''}</div>`,
    prep: rec => rec ? { ...rec, modelText: modelName(rec) } : {},
    onOpen(form) {
      const calc = () => {
        const f = readFields(form, SCHEMA.hardware.fields), m = DB.data.models.find(x => x.name.toLowerCase() === (f.modelText || '').toLowerCase());
        const tmp = { ...f, modelId: m?.id }; const p = plannedDate(tmp);
        $('#hw-calc', form).textContent = `Unit cost used: ${money(unitCostOf(tmp))} · Extended: ${money(lineCost(tmp))} · Planned replacement: ${p ? fmtDate(p) : 'needs a purchase or last-replacement date'}`;
      };
      form.addEventListener('input', e => {
        if (e.target.name === 'modelText') {
          const m = DB.data.models.find(x => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
          if (m) { form.platform.value = m.platform; if (!form.os.value && m.os) form.os.value = m.os; form.unitCost.placeholder = m.unitCost != null ? `Catalog: ${m.unitCost}` : ''; }
        }
        calc();
      });
      calc();
    },
    save(rec, out) {
      const m = findOrCreateModel(out.modelText, out.platform);
      delete out.modelText; out.modelId = m.id;
      if (out.purchaseDate === '' && out.lastReplaced) out.purchaseDate = out.lastReplaced;
      DB.put('hardware', { ...rec, ...out }); DB.log(`${rec ? 'Edited' : 'Added'} hardware line ${m.name} × ${out.qty} in ${labLabel(DB.get('labs', out.labId))}`);
    },
    remove(rec) { DB.remove('hardware', rec.id); DB.log('Deleted hardware line ' + modelName(rec)); }
  },
  device: {
    title: 'Device', table: 'devices', wide: true,
    fields: [
      { k: 'name', label: 'Device name', req: true }, { k: 'assetTag', label: 'Asset tag', help: 'e.g. LAB-0042' }, { k: 'serial', label: 'Serial number' }, { k: 'model', label: 'Model' },
      { k: 'platform', label: 'Platform', type: 'select', options: PLATFORMS, req: true }, { k: 'status', label: 'Status', type: 'select', options: DEVICE_STATUSES, help: 'Blank = automatic (Deployed when in a lab)' },
      { k: 'os', label: 'Operating system' }, { k: 'osVersion', label: 'OS version' }, { k: 'ramGB', label: 'RAM (GB)', type: 'number', min: 0 }, { k: 'storageGB', label: 'Storage (GB)', type: 'number', min: 0 },
      { k: 'labId', label: 'Lab / room', type: 'select', options: labOptions, help: 'Manual assignment is kept when imports run' }, { k: 'user', label: 'Primary user' },
      { k: 'purchaseDate', label: 'Purchase date', type: 'date' }, { k: 'purchaseCost', label: 'Purchase cost', type: 'number', min: 0 },
      { k: 'docLinks', label: 'Links (invoice, PO…; one per line)', type: 'textarea', wide: true, rows: 2 }, { k: 'warrantyEnd', label: 'Warranty ends', type: 'date' }, { k: 'lastCheckIn', label: 'Last check-in', type: 'date' },
      { k: 'notes', label: 'Notes', type: 'textarea', wide: true }],
    save(rec, out) { if (!rec || rec.labId !== out.labId) out.labLocked = true; DB.put('devices', { source: 'Manual', ...rec, ...out }); DB.log(`${rec ? 'Edited' : 'Added'} device ${out.name}`); },
    remove(rec) { DB.data.maintenances.filter(m => m.deviceId === rec.id).forEach(m => DB.remove('maintenances', m.id)); DB.remove('devices', rec.id); location.hash = '#/devices'; }
  },
  maintenance: {
    title: 'Maintenance', table: 'maintenances', defaults: () => ({ type: 'Repair', startDate: todayStr() }),
    fields: [
      { k: 'title', label: 'Title', req: true, wide: true }, { k: 'type', label: 'Type', type: 'select', req: true, options: ['Repair', 'Maintenance', 'Upgrade', 'Hardware test', 'Software / OS', 'Other'] },
      { k: 'labId', label: 'Lab', type: 'select', options: labOptions }, { k: 'startDate', label: 'Start date', type: 'date', req: true }, { k: 'endDate', label: 'Completed', type: 'date', help: 'Blank = still open' },
      { k: 'cost', label: 'Cost', type: 'number', min: 0 }, { k: 'vendor', label: 'Vendor / technician' }, { k: 'notes', label: 'Notes', type: 'textarea', wide: true }]
  },
  software: {
    title: 'Software', table: 'software', wide: true,
    fields: [
      { k: 'name', label: 'Title', req: true }, { k: 'vendor', label: 'Vendor' },
      { k: 'platforms', label: 'Runs on', type: 'multi', options: () => PLATFORMS.slice(0, 2).map(p => ({ v: p, l: p })) }, { k: 'version', label: 'Current version' },
      { k: 'licenseType', label: 'License type', type: 'select', options: ['Subscription', 'Perpetual', 'Site license', 'Free', 'Other'] }, { k: 'annualCost', label: 'Annual cost', type: 'number', min: 0 },
      { k: 'seatsOwned', label: 'Seats owned', type: 'number', min: 0 }, { k: 'licenseExpiry', label: 'License expires', type: 'date' }, { k: 'deployment', label: 'Deployed with', type: 'select', options: ['Intune', 'Mosyle', 'Intune/Mosyle', 'Manual', 'Other'] },
      { k: 'contactIds', label: 'Who to contact', type: 'multi', wide: true, options: contactOptions }, { k: 'notes', label: 'Notes', type: 'textarea', wide: true }],
    remove(rec) { DB.data.labSoftware.filter(x => x.softwareId === rec.id).forEach(x => DB.remove('labSoftware', x.id)); DB.remove('software', rec.id); }
  },
  labSoftware: {
    title: 'Installed software', table: 'labSoftware', noDelete: true,
    fields: [{ k: 'version', label: 'Installed version' }, { k: 'notes', label: 'Notes', type: 'textarea', wide: true }]
  },
  user: {
    title: 'App user', table: 'users', defaults: () => ({ role: 'Editor', active: true }),
    fields: [
      { k: 'name', label: 'Name (shown in the change history)', req: true, help: 'Renaming does not rewrite past history entries' }, { k: 'email', label: 'Email', type: 'email' },
      { k: 'role', label: 'Role', type: 'select', req: true, options: ['Admin', 'Editor', 'Viewer'], help: 'Viewers open the tracker read-only. Roles are a convenience, not security – anyone who can write to the share folder can edit the data file.' },
      { k: 'active', label: 'Active', type: 'check', hint: 'Inactive users no longer appear in the “who are you?” list' },
      { k: 'notes', label: 'Notes', type: 'textarea', wide: true }],
    remove(rec) { if (rec.name === DB.user) { toast('You can’t remove the user you are signed in as', 'err'); return false; } DB.remove('users', rec.id); }
  },
  contact: {
    title: 'Contact', table: 'contacts', defaults: () => ({ platform: 'Any' }),
    fields: [
      { k: 'name', label: 'Name', req: true }, { k: 'role', label: 'Role / title' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'phone', label: 'Phone', type: 'tel' },
      { k: 'type', label: 'Type', type: 'select', options: ['Platform lead', 'Software owner', 'Department', 'Facilities', 'Vendor', 'Other'] },
      { k: 'platform', label: 'Applies to', type: 'select', options: ['Any', 'Windows', 'Mac'], req: true },
      { k: 'platformDefault', label: 'Notify automatically', type: 'check', hint: 'Include on every replacement for labs on this platform', wide: true },
      { k: 'notes', label: 'Notes', type: 'textarea', wide: true }],
    remove(rec) {
      DB.remove('contacts', rec.id);
      DB.data.labs.filter(l => (l.contactIds || []).includes(rec.id)).forEach(l => DB.put('labs', { ...l, contactIds: l.contactIds.filter(x => x !== rec.id) }));
      DB.data.software.filter(s => (s.contactIds || []).includes(rec.id)).forEach(s => DB.put('software', { ...s, contactIds: s.contactIds.filter(x => x !== rec.id) }));
    }
  }
};

function editEntity(kind, id, defaults = {}, after) {
  const sc = SCHEMA[kind], rec = id ? DB.get(sc.table, id) : null;
  const vals = rec ? (sc.prep ? sc.prep(rec) : clone(rec)) : { ...(sc.defaults ? sc.defaults() : {}), ...defaults, ...(sc.prep ? sc.prep(null) : {}) };
  const form = document.createElement('form'); form.className = 'form-grid';
  form.innerHTML = sc.fields.map(f => fieldHTML(f, vals[f.k])).join('') + (sc.extra ? sc.extra(vals) : '') + (rec && (rec._b || rec._c) ? `<div class="field wide small muted">${rec._c ? 'Created by ' + esc(rec._c) + (rec._cu ? ' on ' + esc(fmtDate(rec._cu.slice(0, 10))) : '') + ' · ' : ''}Last edited by ${esc(rec._b || '—')}${rec._u ? ' on ' + esc(fmtDate(rec._u.slice(0, 10))) : ''}</div>` : '');
  form.addEventListener('submit', e => e.preventDefault());
  sc.onOpen?.(form, vals);
  const done = after || (() => render());
  modal({
    title: (rec ? 'Edit ' : 'Add ') + sc.title, body: form, wide: sc.wide,
    buttons: [
      ...(rec && !sc.noDelete ? [{
        label: 'Delete', cls: 'danger left', onClick: () => {
          if (!confirm(`Delete this ${sc.title.toLowerCase()}? This cannot be undone.`)) return false;
          if (sc.remove) { if (sc.remove(rec) === false) return false; } else DB.remove(sc.table, rec.id);
          DB.log(`Deleted ${sc.title.toLowerCase()} ${rec.name || ''}`.trim()); toast('Deleted'); done();
        }
      }] : []),
      { label: 'Cancel' },
      {
        label: 'Save', cls: 'primary', onClick: () => {
          if (!form.reportValidity()) return false;
          const out = readFields(form, sc.fields);
          if (sc.save) { if (sc.save(rec, out) === false) return false; }
          else { DB.put(sc.table, { ...(rec || defaults), ...out }); DB.log(`${rec ? 'Edited' : 'Added'} ${sc.title.toLowerCase()} ${out.name || ''}`.trim()); }
          toast('Saved'); done();
        }
      }]
  });
}

// ---------- router ----------
const VIEWS = {};
const NAV = [
  ['dashboard', 'Dashboard', 'home'],
  ['sep', 'Planning'], ['plan', 'Replacement plan', 'calendar'], ['planner', 'Budget planner', 'dollar'], ['proposals', 'Proposals', 'file'], ['projects', 'Projects', 'tool'],
  ['sep', 'Assets'], ['labs', 'Labs', 'monitor'], ['hardware', 'Hardware', 'cpu'], ['devices', 'Devices', 'laptop'], ['models', 'Models & costs', 'tag'], ['audit', 'Labels & audits', 'tag'],
  ['sep', 'Software & people'], ['software', 'Software', 'package'], ['contacts', 'Contacts', 'users'], ['users', 'App users', 'users'],
  ['sep', 'Operations'], ['maintenance', 'Maintenance', 'tool'], ['reports', 'Reports', 'trend'], ['charts', 'Charts', 'pie'],
  ['sep', 'Admin'], ['import', 'Import', 'upload'], ['settings', 'Settings & data', 'sliders']
];
const NAV_COUNT = { labs: () => DB.data.labs.length, devices: () => DB.data.devices.length };
function route() { const [, name = 'dashboard', param] = location.hash.split('/'); return { name, param: param ? decodeURIComponent(param) : '' }; }
function render() {
  if (UI.modal) { UI.needsRender = true; return; }
  applyTheme();
  const { name, param } = route(), v = VIEWS[name === 'lab' ? 'lab' : name] || VIEWS.dashboard;
  $('#nav').innerHTML = NAV.map(([k, l, i]) => k === 'sep' ? `<div class="sep">${l}</div>` : `<a href="#/${k}" title="${l}" class="${(name === k || (name === 'lab' && k === 'labs') || (name === 'device' && k === 'devices') || (name === 'proposal' && k === 'proposals')) ? 'on' : ''}">${ic(i)}<span>${l}</span>${NAV_COUNT[k] ? `<span class="cnt">${fmtNum(NAV_COUNT[k]())}</span>` : ''}</a>`).join('');
  $('#org').textContent = DB.data.settings.orgName || '';
  const el = $('#view'); el.innerHTML = '';
  try { v.render(el, param); mountCharts(el); } catch (e) { console.error(e); el.innerHTML = `<div class="card"><h2>Something went wrong drawing this page</h2><pre>${esc(e.stack || e.message)}</pre></div>`; }
  updateStatus();
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
function onRemoteChange() { if (UI.modal) { UI.needsRender = true; return; } const a = document.activeElement; if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && $('#view').contains(a)) return; render(); }
const pageHead = (title, actions = '', crumb = '') => `<div class="crumbs"><a href="#/dashboard">Home</a> › ${crumb || esc(title)}</div><div class="page-h"><h1>${esc(title)}</h1><span class="spacer"></span>${actions}</div>`;
