// Hardware, devices, models, software (+ lab matrix), contacts.
SCHEMA.lab.remove = rec => {
  (linesByLab().get(rec.id) || []).slice().forEach(l => DB.remove('hardware', l.id));
  (swByLab().get(rec.id) || []).slice().forEach(x => DB.remove('labSoftware', x.id));
  (devicesByLab().get(rec.id) || []).slice().forEach(d => DB.put('devices', { ...d, labId: '', labLocked: false }));
  DB.remove('labs', rec.id); location.hash = '#/labs';
};
SCHEMA.model.remove = rec => {
  const n = DB.data.hardware.filter(l => l.modelId === rec.id).length;
  if (n) { toast(`${n} hardware line(s) use this model – change them first`, 'err'); return false; }
  DB.remove('models', rec.id);
};

VIEWS.hardware = {
  render(el) {
    el.innerHTML = pageHead('Hardware inventory', `<button class="btn primary edit-only" data-act="add">Add hardware line</button>`) + `<div id="t"></div>`;
    mountTable($('#t', el), {
      id: 'hardware', csvName: 'hardware', rows: () => DB.data.hardware, rowId: r => r.id, onRow: id => editEntity('hardware', id), defaultSort: { k: 'planned', dir: 'asc' },
      empty: 'No hardware lines yet.', searchText: r => [labLabel(DB.get('labs', r.labId)), modelName(r), r.os].join(' '),
      filters: [
        { k: 'p', label: 'Platform', options: () => PLATFORMS, test: (r, v) => platformOf(r) === v },
        { k: 'f', label: 'Funding', options: fundingOptions, test: (r, v) => r.fundingSource === v },
        { k: 'b', label: 'Building', options: buildingOptions, test: (r, v) => DB.get('labs', r.labId)?.buildingId === v },
        { k: 's', label: 'State', options: () => ['Overdue', 'Due soon', 'OK', 'No date', 'Spare', 'Retired'], test: (r, v) => lineState(r) === v }],
      cols: [
        { k: 'lab', label: 'Lab', val: r => labLabel(DB.get('labs', r.labId)) }, { k: 'model', label: 'Model', val: modelName }, { k: 'plat', label: 'Platform', val: platformOf },
        { k: 'qty', label: 'Qty', val: r => +r.qty || 0, num: true }, { k: 'unit', label: 'Unit cost', val: unitCostOf, html: r => money(unitCostOf(r)), num: true },
        { k: 'cost', label: 'Est. cost', val: lineCost, html: r => money(lineCost(r)), num: true }, { k: 'os', label: 'OS', val: r => r.os || '' }, { k: 'spec', label: 'Specs', val: r => modelSpec(getModel(r)), hidden: true },
        { k: 'fund', label: 'Purchased with', val: r => r.fundingSource || '', html: r => r.fundingSource ? esc(r.fundingSource) + (r.fundingRef ? ` <span class="muted small">${esc(r.fundingRef)}</span>` : '') : '<span class="muted">—</span>' },
        { k: 'pfund', label: 'Plan funding', val: plannedFundingOf, hidden: true },
        { k: 'warr', label: 'Warranty', val: r => r.warrantyEnd || '', html: r => r.warrantyEnd ? fmtDate(r.warrantyEnd) + (r.warrantyEnd < todayStr() ? ' <span class="badge bad">expired</span>' : '') : '<span class="muted">—</span>' },
        { k: 'enr', label: 'Management', val: r => r.enrollment || '', hidden: true }, { k: 'rst', label: 'Refresh status', val: r => r.refreshStatus || '', hidden: true }, { k: 'rpo', label: 'Replacement PO', val: r => r.replacementPO || '', hidden: true }, { k: 'phys', label: 'Physical count', val: r => r.physicalCount ?? '', hidden: true, num: true },
        { k: 'last', label: 'Last replaced', val: r => r.lastReplaced || r.purchaseDate || '', html: r => fmtDate(ageBase(r)) }, { k: 'life', label: 'Lifecycle (yrs)', val: lifecycleYears, num: true },
        { k: 'planned', label: 'Planned', val: plannedDate, html: r => fmtDate(plannedDate(r)) }, { k: 'state', label: 'State', val: lineState, html: r => stateBadge(lineState(r)) }],
      foot: (c, rows) => c.k === 'lab' ? 'Total (filtered)' : c.k === 'qty' ? fmtNum(sum(rows, r => +r.qty || 0)) : c.k === 'cost' ? money(sum(rows, lineCost)) : ''
    });
    el.onclick = e => { if (e.target.closest('[data-act="add"]')) editEntity('hardware'); };
  }
};

function assignDevicesDialog(ids, done) {
  const body = document.createElement('div');
  body.innerHTML = `<div class="field"><label>Check out ${ids.length} device(s) to</label><select><option value="">— Choose a lab —</option>${optionsHTML(labOptions())}</select></div>
  <label class="chk" style="margin-top:10px"><input type="checkbox" id="kw"> Also add the device-name prefix to the lab’s match keywords so future imports link automatically</label>`;
  modal({
    title: 'Check out to lab', body, buttons: [{ label: 'Cancel' }, {
      label: 'Check out', cls: 'primary', onClick: () => {
        const labId = $('select', body).value; if (!labId) { toast('Choose a lab first', 'err'); return false; }
        ids.forEach(id => { const d = DB.get('devices', id); if (d) DB.put('devices', { ...d, labId, labLocked: true, status: ['Ready to deploy', 'Deployed', undefined, ''].includes(d.status) ? '' : d.status }); });
        if ($('#kw', body).checked) {
          const lab = DB.get('labs', labId), prefixes = new Set(ids.map(id => namePrefix(DB.get('devices', id)?.name)).filter(Boolean));
          const kws = new Set((lab.match || '').split(',').map(s => s.trim()).filter(Boolean)); prefixes.forEach(p => kws.add(p));
          DB.put('labs', { ...lab, match: [...kws].join(', ') });
        }
        DB.log(`Checked out ${ids.length} device(s) to ${labLabel(DB.get('labs', labId))}`); done(); toast('Checked out'); render();
      }
    }]
  });
}
function checkinDevices(ids, done) {
  if (!confirm(`Check in ${ids.length} device(s)? They will no longer belong to a lab.`)) return;
  ids.forEach(id => { const d = DB.get('devices', id); if (d) DB.put('devices', { ...d, labId: '', labLocked: true, status: d.status === 'Deployed' ? '' : d.status }); });
  DB.log(`Checked in ${ids.length} device(s)`); done(); toast('Checked in'); render();
}
function setStatusDialog(ids, done) {
  const body = document.createElement('div');
  body.innerHTML = `<div class="field"><label>Set status of ${ids.length} device(s)</label><select>${optionsHTML(DEVICE_STATUSES)}</select></div>`;
  modal({ title: 'Change status', body, buttons: [{ label: 'Cancel' }, { label: 'Apply', cls: 'primary', onClick: () => { const v = $('select', body).value; ids.forEach(id => { const d = DB.get('devices', id); if (d) DB.put('devices', { ...d, status: v }); }); DB.log(`Set ${ids.length} device(s) to ${v}`); done(); render(); } }] });
}
function generateTags(ids, done) {
  const pre = S().assetTagPrefix || 'LAB-';
  let n = Math.max(0, ...DB.data.devices.map(d => d.assetTag?.startsWith(pre) ? parseInt(d.assetTag.slice(pre.length), 10) || 0 : 0));
  const todo = ids.map(id => DB.get('devices', id)).filter(d => d && !d.assetTag);
  if (!todo.length) return toast('Every selected device already has an asset tag.');
  if (!confirm(`Assign ${todo.length} new asset tag(s) starting at ${pre}${String(n + 1).padStart(4, '0')}?`)) return;
  todo.forEach(d => DB.put('devices', { ...d, assetTag: pre + String(++n).padStart(4, '0') }));
  DB.log(`Generated ${todo.length} asset tags`); done(); toast(`Generated ${todo.length} tags`); render();
}
VIEWS.devices = {
  render(el) {
    el.innerHTML = pageHead('Devices', `<button class="btn edit-only" data-act="relink" title="Re-run name matching on devices you haven’t assigned by hand">Re-link by name</button><a class="btn" href="#/import">${ic('upload')} Import</a><button class="btn primary edit-only" data-act="add">${ic('plus')} Add device</button>`) + `<p class="muted small" style="margin-top:-8px">Individual devices from Intune, Mosyle and LabStats. They are matched by serial number, so re-importing updates OS, model and last check-in instead of duplicating. Check devices out to labs, track status and asset tags, and open one for its history and repairs.</p><div id="t"></div>`;
    const days = d => d.lastCheckIn ? daysBetween(d.lastCheckIn, todayStr()) : null, labOf = r => r.labId ? labLabel(DB.get('labs', r.labId)) : '';
    mountTable($('#t', el), {
      id: 'devices', csvName: 'devices', rows: () => DB.data.devices, rowId: r => r.id, onRow: id => location.hash = '#/device/' + id, selectable: true, defaultSort: { k: 'name', dir: 'asc' },
      empty: 'No devices yet. Use Import to load an Intune, Mosyle or LabStats export.', searchText: r => [r.name, r.assetTag, r.serial, r.model, r.os, r.user, labOf(r)].join(' '),
      filters: [
        { k: 'st', label: 'Status', options: () => DEVICE_STATUSES, test: (r, v) => devStatus(r) === v }, { k: 'p', label: 'Platform', options: () => PLATFORMS, test: (r, v) => r.platform === v },
        { k: 'src', label: 'Source', options: () => ['Intune', 'Mosyle', 'LabStats', 'Manual'], test: (r, v) => (r.source || 'Manual') === v },
        { k: 'lab', label: 'Lab', options: labOptions, test: (r, v) => r.labId === v }, { k: 'os', label: 'OS', options: () => [...new Set(DB.data.devices.map(d => d.os).filter(Boolean))].sort(), test: (r, v) => r.os === v },
        { k: 'h', label: 'Health', options: () => ['Stale', 'Missing from export', 'No asset tag', 'OS unsupported'], test: (r, v) => v === 'Stale' ? (days(r) ?? 0) > S().staleDays : v === 'No asset tag' ? !r.assetTag : v === 'OS unsupported' ? osState(r) === 'Unsupported' : !!r.missing }],
      bulk: [{ label: 'Check out to lab…', fn: assignDevicesDialog }, { label: 'Check in', fn: checkinDevices }, { label: 'Set status…', fn: setStatusDialog }, { label: 'Generate asset tags', fn: generateTags }, { label: 'Lenovo batch file…', fn: ids => lenovoBatchDialog(ids) }, { label: 'Apple coverage…', fn: ids => appleCoverageDialog(ids) }, ...(lenovoKey() ? [{ label: 'Lenovo API lookup', fn: (ids, clear) => { lenovoLookupDevices(ids).then(() => { clear(); render(); }); } }] : []),
      { label: 'Retire / dispose…', fn: (ids, clear) => disposeDialog(ids, clear) }, { label: 'Delete', fn: (ids, clear) => { if (confirm(`Delete ${ids.length} device record(s)?`)) { ids.forEach(id => DB.remove('devices', id)); DB.log(`Deleted ${ids.length} devices`); clear(); render(); } } }],
      cols: [
        { k: 'name', label: 'Name', val: r => r.name, html: r => `<a href="#/device/${r.id}">${esc(r.name)}</a>` }, { k: 'tag', label: 'Asset tag', val: r => r.assetTag || '' }, { k: 'serial', label: 'Serial', val: r => r.serial },
        { k: 'model', label: 'Model', val: r => r.model }, { k: 'plat', label: 'Platform', val: r => r.platform, hidden: true }, { k: 'os', label: 'OS', val: r => r.os, html: r => esc(r.os || '') + osBadge(r) }, { k: 'ver', label: 'Version', val: r => r.osVersion, hidden: true },
        { k: 'lab', label: 'Lab', val: labOf, html: r => r.labId ? `<a href="#/lab/${r.labId}">${esc(labOf(r))}</a>` : '<span class="muted">—</span>' },
        { k: 'status', label: 'Status', val: devStatus, html: r => statusBadge(devStatus(r)) + (r.missing ? ' <span class="badge bad">not in export</span>' : '') },
        { k: 'src', label: 'Source', val: r => r.source || 'Manual', hidden: true }, { k: 'user', label: 'Primary user', val: r => r.user, hidden: true },
        { k: 'chk', label: 'Last check-in', val: r => r.lastCheckIn || '', html: r => r.lastCheckIn ? fmtDate(r.lastCheckIn) + ((days(r) ?? 0) > S().staleDays ? ' <span class="badge warn">stale</span>' : '') : '—' }]
    });
    el.onclick = e => {
      if (e.target.closest('[data-act="add"]')) editEntity('device');
      if (e.target.closest('[data-act="relink"]') && confirm('Re-run name matching on every device that was not assigned by hand? Their labs may change.')) { toast(`Re-linked ${relinkDevices()} device(s)`); render(); }
    };
  }
};

VIEWS.models = {
  render(el) {
    el.innerHTML = pageHead('Models & configurations', `<button class="btn primary edit-only" data-act="add">${ic('plus')} Add model</button>`) +
      `<p class="muted small" style="margin-top:-8px">Your repository of standard devices: one entry per model <i>configuration</i> (CPU, RAM, storage, default OS, price, lifecycle). Hardware lines pick from here, so costs, specs and emails stay consistent. Use <b>Duplicate</b> to add another configuration of the same model.</p><div id="t"></div>`;
    const inUse = r => sum(DB.data.hardware.filter(l => l.modelId === r.id && isActiveLine(l)), l => +l.qty || 0);
    mountTable($('#t', el), {
      id: 'models', csvName: 'models', rows: () => DB.data.models, rowId: r => r.id, onRow: id => editEntity('model', id), defaultSort: { k: 'family', dir: 'asc' }, searchText: r => [r.name, r.family, r.cpu, r.manufacturer, r.partNumber].join(' '),
      filters: [{ k: 'p', label: 'Platform', options: () => PLATFORMS, test: (r, v) => r.platform === v }, { k: 'cat', label: 'Category', options: () => ['Desktop', 'Laptop', 'All-in-one', 'Workstation', 'Tablet', 'Other'], test: (r, v) => r.category === v },
      { k: 'c', label: 'Cost', options: () => ['Missing cost', 'Missing specs'], test: (r, v) => v === 'Missing cost' ? !(+r.unitCost) : !(r.ramGB && r.storageGB) }],
      cols: [
        { k: 'family', label: 'Family', val: r => r.family || r.name }, { k: 'name', label: 'Configuration', val: r => r.name }, { k: 'cat', label: 'Category', val: r => r.category || '' }, { k: 'mf', label: 'Manufacturer', val: r => r.manufacturer, hidden: true },
        { k: 'plat', label: 'Platform', val: r => r.platform }, { k: 'cpu', label: 'Processor', val: r => r.cpu || '' },
        { k: 'ram', label: 'RAM', val: r => +r.ramGB || 0, html: r => r.ramGB ? r.ramGB + ' GB' : '<span class="muted">—</span>', num: true },
        { k: 'sto', label: 'Storage', val: r => +r.storageGB || 0, html: r => r.storageGB ? `${fmtStorage(r.storageGB)} <span class="muted small">${esc(r.storageType || '')}</span>` : '<span class="muted">—</span>', num: true },
        { k: 'os', label: 'Default OS', val: r => r.os || '', hidden: true },
        { k: 'cost', label: 'Unit cost', val: r => +r.unitCost || 0, html: r => +r.unitCost ? money(r.unitCost) : '<span class="badge warn">needs cost</span>', num: true },
        { k: 'life', label: 'Lifecycle (yrs)', val: r => r.lifecycleYears || S().lifecycle[r.platform] || '', num: true }, { k: 'war', label: 'Warranty (yrs)', val: r => r.warrantyYears || '', num: true, hidden: true },
        { k: 'qty', label: 'In inventory', val: inUse, num: true },
        { k: 'dev', label: 'Managed devices', val: r => DB.data.devices.filter(d => (d.model || '').toLowerCase() === r.name.toLowerCase()).length, num: true, hidden: true },
        { k: 'dup', label: '', html: r => `<button class="btn sm edit-only" data-dup="${r.id}">Duplicate</button>` }]
    });
    el.onclick = e => {
      if (e.target.closest('[data-act="add"]')) return editEntity('model');
      const d = e.target.closest('[data-dup]');
      if (d) { const m = DB.get('models', d.dataset.dup), { id, _u, _b, ...rest } = m; editEntity('model', null, { ...rest, name: m.name + ' (copy)' }); }
    };
  }
};

VIEWS.software = {
  render(el) {
    const tab = UI.swTab || 'catalog';
    el.innerHTML = pageHead('Software', `<button class="btn primary edit-only" data-act="add">Add software</button>`) +
      `<div class="tabs"><a data-tab="catalog" class="${tab === 'catalog' ? 'on' : ''}">Catalog</a><a data-tab="matrix" class="${tab === 'matrix' ? 'on' : ''}">Software by lab</a><a data-tab="confirm" class="${tab === 'confirm' ? 'on' : ''}">Confirmations<span class="tc">${DB.data.confirmations.filter(c => c.status === 'Sent').length}</span></a><a data-tab="baselines" class="${tab === 'baselines' ? 'on' : ''}">Baselines</a></div><div id="t"></div>`;
    if (tab === 'catalog') {
      mountTable($('#t', el), {
        id: 'software', csvName: 'software', rows: () => DB.data.software, rowId: r => r.id, onRow: id => editEntity('software', id), defaultSort: { k: 'name', dir: 'asc' },
        filters: [{ k: 'p', label: 'Platform', options: () => PLATFORMS.slice(0, 2), test: (r, v) => (r.platforms || []).includes(v) }, { k: 'l', label: 'License', options: () => ['Subscription', 'Perpetual', 'Site license', 'Free'], test: (r, v) => r.licenseType === v },
        { k: 'x', label: 'Expiry', options: () => ['Expiring soon'], test: r => r.licenseExpiry && daysBetween(todayStr(), r.licenseExpiry) <= S().licenseWarnDays }],
        cols: [
          { k: 'name', label: 'Title', val: r => r.name }, { k: 'vendor', label: 'Vendor', val: r => r.vendor }, { k: 'plat', label: 'Runs on', val: r => (r.platforms || []).join(' / ') },
          { k: 'ver', label: 'Version', val: r => r.version }, { k: 'lic', label: 'License', val: r => r.licenseType },
          { k: 'exp', label: 'Expires', val: r => r.licenseExpiry || '', html: r => r.licenseExpiry ? fmtDate(r.licenseExpiry) + (daysBetween(todayStr(), r.licenseExpiry) <= S().licenseWarnDays ? ' <span class="badge warn">soon</span>' : '') : '—' },
          { k: 'cost', label: 'Annual cost', val: r => +r.annualCost || 0, html: r => money(r.annualCost), num: true }, { k: 'dep', label: 'Deployed with', val: r => r.deployment },
          { k: 'labs', label: 'Labs', val: r => DB.data.labSoftware.filter(x => x.softwareId === r.id).length, num: true },
          { k: 'who', label: 'Contacts', val: r => (r.contactIds || []).map(id => DB.get('contacts', id)?.name).filter(Boolean).join(', ') }],
        foot: (c, rows) => c.k === 'name' ? 'Total' : c.k === 'cost' ? money(sum(rows, r => +r.annualCost || 0)) : ''
      });
    } else if (tab === 'matrix') matrixView($('#t', el)); else if (tab === 'confirm') confirmationsView($('#t', el)); else baselinesView($('#t', el));
    el.onclick = e => {
      const tb = e.target.closest('[data-tab]'); if (tb) { UI.swTab = tb.dataset.tab; return render(); }
      if (e.target.closest('[data-act="add"]')) editEntity('software');
    };
  }
};
function matrixView(host) {
  const M = UI.matrix ??= { p: '', b: '' };
  const labs = DB.data.labs.filter(l => (!M.b || l.buildingId === M.b) && (!M.p || labPlatforms(l).includes(M.p))).sort((a, b) => cmp(labLabel(a), labLabel(b)));
  const sws = DB.data.software.filter(s => !M.p || (s.platforms || []).includes(M.p)).sort((a, b) => cmp(a.name, b.name));
  const has = new Set(DB.data.labSoftware.map(x => x.labId + '|' + x.softwareId));
  host.innerHTML = `<div class="tbl-bar"><select id="m-p"><option value="">Platform: all</option>${optionsHTML(PLATFORMS.slice(0, 2), M.p)}</select><select id="m-b"><option value="">Building: all</option>${optionsHTML(buildingOptions(), M.b)}</select><span class="spacer"></span><button class="btn sm" id="m-csv">Export CSV</button></div>
  ${labs.length && sws.length ? `<div class="tbl-wrap"><table class="matrix"><thead><tr><th>Lab</th>${sws.map(s => `<th title="${esc(s.name)}">${esc(trunc(s.name, 14))}<div class="muted small">${(s.platforms || []).map(p => p[0]).join('/')}</div></th>`).join('')}</tr></thead>
  <tbody>${labs.map(l => { const lp = labPlatforms(l); return `<tr><td>${esc(labLabel(l))}</td>${sws.map(s => { const ok = !lp.length || (s.platforms || []).some(p => lp.includes(p)); return `<td class="${ok ? '' : 'dim'}"><input type="checkbox" data-l="${l.id}" data-s="${s.id}"${has.has(l.id + '|' + s.id) ? ' checked' : ''}${ok ? '' : ' title="Not available for this lab’s platform"'}></td>`; }).join('')}</tr>`; }).join('')}</tbody>
  <tfoot><tr><td>Labs with title</td>${sws.map(s => `<td>${labs.filter(l => has.has(l.id + '|' + s.id)).length}</td>`).join('')}</tr></tfoot></table></div>` : '<div class="empty">Add labs and software titles to see the matrix.</div>'}`;
  $('#m-p', host).onchange = e => { M.p = e.target.value; render(); }; $('#m-b', host).onchange = e => { M.b = e.target.value; render(); };
  $('#m-csv', host).onclick = () => download('software-by-lab.csv', toCSV([['Lab', ...sws.map(s => s.name)], ...labs.map(l => [labLabel(l), ...sws.map(s => has.has(l.id + '|' + s.id) ? 'X' : '')])]));
  host.addEventListener('change', e => {
    const c = e.target; if (!c.dataset.l) return;
    if (c.checked) DB.put('labSoftware', { labId: c.dataset.l, softwareId: c.dataset.s });
    else { const r = DB.data.labSoftware.find(x => x.labId === c.dataset.l && x.softwareId === c.dataset.s); if (r) DB.remove('labSoftware', r.id); }
    DB.mut++;
  });
}

VIEWS.contacts = {
  render(el) {
    el.innerHTML = pageHead('Contacts', `<button class="btn primary edit-only" data-act="add">Add contact</button>`) +
      `<p class="muted small">Link contacts to a lab, to a software title, or mark them “notify automatically” for a platform. The replacement plan then lists who to tell for each lab.</p><div id="t"></div>`;
    mountTable($('#t', el), {
      id: 'contacts', csvName: 'contacts', rows: () => DB.data.contacts, rowId: r => r.id, onRow: id => editEntity('contact', id), defaultSort: { k: 'name', dir: 'asc' },
      filters: [{ k: 'p', label: 'Applies to', options: () => ['Any', 'Windows', 'Mac'], test: (r, v) => (r.platform || 'Any') === v }, { k: 't', label: 'Type', options: () => ['Platform lead', 'Software owner', 'Department', 'Facilities', 'Vendor', 'Other'], test: (r, v) => r.type === v }],
      cols: [
        { k: 'name', label: 'Name', val: r => r.name }, { k: 'role', label: 'Role', val: r => r.role }, { k: 'email', label: 'Email', val: r => r.email, html: r => r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '' },
        { k: 'phone', label: 'Phone', val: r => r.phone }, { k: 'type', label: 'Type', val: r => r.type }, { k: 'plat', label: 'Applies to', val: r => r.platform || 'Any' },
        { k: 'auto', label: 'Auto-notify', val: r => r.platformDefault ? 'Yes' : '' },
        { k: 'used', label: 'Linked to', val: r => DB.data.labs.filter(l => (l.contactIds || []).includes(r.id)).length + DB.data.software.filter(s => (s.contactIds || []).includes(r.id)).length, num: true }]
    });
    el.onclick = e => { if (e.target.closest('[data-act="add"]')) editEntity('contact'); };
  }
};
