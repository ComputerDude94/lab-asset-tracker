// Inventory: devices that are not in a lab yet. Stock lines are counted by model (unboxed units in the depot, units being prepped);
// individual devices with a serial number that are "Ready to deploy" and not in a lab show up here too, so one page covers both.
const STOCK_STATES = ['Awaiting prep', 'Being prepped', 'Ready to deploy', 'Reserved'];
const stockLocs = () => S().stockLocations || ['Depot', 'Prep room'];
const stockDevices = () => DB.data.devices.filter(d => !d.labId && ['Ready to deploy', 'Pending'].includes(devStatus(d)));
const stockUnitCost = l => unitCostOf(l);
SCHEMA.stock = {
  title: 'Stock line', table: 'stock', wide: true, defaults: () => ({ qty: 1, location: stockLocs()[0], state: 'Awaiting prep', receivedDate: todayStr() }),
  fields: [
    { k: 'modelText', label: 'Model', req: true, list: 'dl-models', help: 'Pick from the catalog or type a new one' }, { k: 'platform', label: 'Platform', type: 'select', options: PLATFORMS, req: true },
    { k: 'qty', label: 'Quantity', type: 'number', min: 0, req: true }, { k: 'location', label: 'Location', type: 'select', options: () => stockLocs(), req: true },
    { k: 'state', label: 'State', type: 'select', options: STOCK_STATES, req: true, help: 'Awaiting prep = still boxed; Reserved = set aside for a lab' }, { k: 'reservedLabId', label: 'Reserved for lab', type: 'select', options: labOptions },
    { k: 'receivedDate', label: 'Received', type: 'date' }, { k: 'poRef', label: 'PO / project #' }, { k: 'unitCost', label: 'Unit cost (override)', type: 'number', min: 0 },
    { k: 'notes', label: 'Notes', type: 'textarea', wide: true }],
  extra: () => dlModels(), prep: rec => rec ? { ...rec, modelText: modelName(rec) } : {},
  save(rec, out) {
    const m = findOrCreateModel(out.modelText, out.platform); delete out.modelText; out.modelId = m.id;
    DB.put('stock', { ...rec, ...out }); DB.log(`${rec ? 'Edited' : 'Received'} stock ${m.name} × ${out.qty} (${out.location})`);
  },
  remove(rec) { DB.remove('stock', rec.id); DB.log('Deleted stock line ' + modelName(rec)); }
};
// Put `qty` units of a line at a location/state, merging into an identical line when there is one.
function moveStock(line, to, qty, state) {
  qty = Math.max(0, Math.min(+qty || 0, +line.qty)); if (!qty) return;
  const st = state || line.state, same = DB.data.stock.find(x => x.id !== line.id && x.modelId === line.modelId && x.location === to && x.state === st && (x.poRef || '') === (line.poRef || '') && (x.reservedLabId || '') === (line.reservedLabId || ''));
  if (qty >= line.qty) {
    if (same) { DB.put('stock', { ...same, qty: +same.qty + +line.qty }); DB.remove('stock', line.id); } else DB.put('stock', { ...line, location: to, state: st });
  } else {
    DB.put('stock', { ...line, qty: line.qty - qty });
    if (same) DB.put('stock', { ...same, qty: +same.qty + qty }); else { const { id, _u, _b, _c, _cu, ...rest } = line; DB.put('stock', { ...rest, qty, location: to, state: st }); }
  }
  DB.log(`Moved ${qty} × ${modelName(line)} to ${to}${state ? ' (' + state + ')' : ''}`);
}
function moveStockDialog(id) {
  const l = DB.get('stock', id), form = document.createElement('form'); form.className = 'form-grid';
  const f = [{ k: 'qty', label: `Quantity to move (of ${l.qty})`, type: 'number', min: 1, req: true }, { k: 'to', label: 'Move to', type: 'select', options: stockLocs(), req: true }, { k: 'state', label: 'New state', type: 'select', options: STOCK_STATES }];
  form.innerHTML = f.map(x => fieldHTML(x, { qty: l.qty, to: stockLocs().find(x => x !== l.location) || l.location, state: l.state }[x.k])).join('');
  form.addEventListener('submit', e => e.preventDefault());
  modal({ title: `Move ${modelName(l)}`, body: form, buttons: [{ label: 'Cancel' }, { label: 'Move', cls: 'primary', onClick: () => { if (!form.reportValidity()) return false; const o = readFields(form, f); moveStock(l, o.to, o.qty, o.state); toast('Moved'); render(); } }] });
}
function deployStockDialog(id) {
  const l = DB.get('stock', id), form = document.createElement('form'); form.className = 'form-grid';
  const f = [{ k: 'qty', label: `Quantity (of ${l.qty})`, type: 'number', min: 1, req: true }, { k: 'labId', label: 'Deploy to lab', type: 'select', req: true, options: labOptions }, { k: 'add', label: 'Also add to that lab’s hardware count', type: 'check' }];
  form.innerHTML = f.map(x => fieldHTML(x, { qty: l.qty, labId: l.reservedLabId || '', add: false }[x.k])).join('') + `<div class="field wide help">Removes the units from stock. Tick the box to add them to the lab’s hardware line for this model (or create one). Leave it off if you are replacing devices there and will use “Mark replaced” instead.</div>`;
  form.addEventListener('submit', e => e.preventDefault());
  modal({ title: `Deploy ${modelName(l)}`, body: form, buttons: [{ label: 'Cancel' }, { label: 'Deploy', cls: 'primary', onClick: () => {
    if (!form.reportValidity()) return false; const o = readFields(form, f), n = Math.min(+o.qty, +l.qty), lab = DB.get('labs', o.labId);
    if (n >= l.qty) DB.remove('stock', l.id); else DB.put('stock', { ...l, qty: l.qty - n });
    if (o.add) { const hw = DB.data.hardware.find(h => h.labId === o.labId && h.modelId === l.modelId && isActiveLine(h)); if (hw) DB.put('hardware', { ...hw, qty: (+hw.qty || 0) + n }); else DB.put('hardware', { labId: o.labId, modelId: l.modelId, platform: l.platform || getModel(l)?.platform || 'Other', qty: n, status: 'In service', purchaseDate: todayStr(), lastReplaced: todayStr(), fundingRef: l.poRef || '' }); }
    DB.log(`Deployed ${n} × ${modelName(l)} from ${l.location} to ${labLabel(lab)}`); toast('Deployed'); render();
  } }] });
}
function deployDeviceDialog(id) {
  const d = DB.get('devices', id), form = document.createElement('form'), f = [{ k: 'labId', label: 'Deploy to lab', type: 'select', req: true, options: labOptions }]; form.className = 'form-grid';
  form.innerHTML = fieldHTML(f[0], ''); form.addEventListener('submit', e => e.preventDefault());
  modal({ title: `Deploy ${d.name || d.serial}`, body: form, buttons: [{ label: 'Cancel' }, { label: 'Deploy', cls: 'primary', onClick: () => { if (!form.reportValidity()) return false; const o = readFields(form, f); DB.put('devices', { ...d, labId: o.labId, labLocked: true, status: '', stockLoc: '' }); DB.log(`Deployed device ${d.name || d.serial} to ${labLabel(DB.get('labs', o.labId))}`); toast('Deployed'); render(); } }] });
}
function manageLocationsDialog() {
  const body = document.createElement('div'); body.innerHTML = `<div class="field"><label>Stock locations (one per line)</label><textarea id="sl" rows="6" style="width:100%">${esc(stockLocs().join('\n'))}</textarea></div><p class="small muted">Stock in a location you remove moves to “No location” until you move it.</p>`;
  modal({ title: 'Stock locations', body, buttons: [{ label: 'Cancel' }, { label: 'Save', cls: 'primary', onClick: () => { const v = [...new Set($('#sl', body).value.split('\n').map(x => x.trim()).filter(Boolean))]; if (!v.length) { toast('Keep at least one location', 'bad'); return false; } DB.setSetting('stockLocations', v); render(); } }] });
}

VIEWS.inventory = {
  render(el) {
    const d = DB.data, t = todayStr(), locs = stockLocs(), lines = d.stock, devs = stockDevices();
    const qty = l => +l.qty || 0, val = l => qty(l) * stockUnitCost(l), devVal = x => +x.purchaseCost || 0;
    const units = sum(lines, qty) + devs.length, ready = sum(lines.filter(l => l.state === 'Ready to deploy'), qty) + devs.filter(x => devStatus(x) === 'Ready to deploy').length;
    const prepping = sum(lines.filter(l => l.state === 'Being prepped'), qty) + devs.filter(x => devStatus(x) === 'Pending').length;
    const raw = sum(lines.filter(l => l.state === 'Awaiting prep'), qty), reserved = sum(lines.filter(l => l.state === 'Reserved'), qty);
    const worth = sum(lines, val) + sum(devs, devVal);
    const cols = [...locs, ...(lines.some(l => !locs.includes(l.location)) ? ['No location'] : [])];
    const stateCls = { 'Awaiting prep': '', 'Being prepped': 'warn', 'Ready to deploy': 'ok', Reserved: 'info' };
    const card = l => { const age = l.receivedDate && l.state === 'Awaiting prep' ? daysBetween(l.receivedDate, t) : 0;
      return `<div class="card kcard" ${cols.includes(l.location) && l.location ? 'draggable="true"' : ''} data-card="${l.id}" style="padding:10px;margin-bottom:8px"><div style="display:flex;gap:8px;align-items:baseline"><b data-e="${l.id}" style="cursor:pointer;flex:1">${esc(modelName(l))}</b><span class="big-n" style="font-size:22px">${qty(l)}</span></div><div class="chips"><span class="badge ${stateCls[l.state] || ''}">${esc(l.state)}</span>${l.reservedLabId ? `<span class="badge info">${esc(labLabel(DB.get('labs', l.reservedLabId)))}</span>` : ''}${age > 30 ? `<span class="badge warn" title="Still boxed">${age} days boxed</span>` : ''}</div><div class="small muted">${[l.poRef && 'PO ' + esc(l.poRef), l.receivedDate && 'received ' + fmtDate(l.receivedDate)].filter(Boolean).join(' · ')}</div><div class="chips edit-only" style="margin-top:6px"><button class="btn sm" data-move="${l.id}">Move…</button><button class="btn sm" data-dep="${l.id}">Deploy…</button></div></div>`; };
    const col = c => { const ls = lines.filter(l => (c === 'No location' ? !locs.includes(l.location) : l.location === c)), ds = devs.filter(x => (x.stockLoc || '') === c || (c === locs[0] && !x.stockLoc));
      return `<div class="kcol" data-col="${esc(c)}"><div class="small muted" style="margin-bottom:6px"><b>${esc(c)}</b> · ${fmtNum(sum(ls, qty) + ds.length)} units${ds.length ? ` (${ds.length} serialized)` : ''} · ${money(sum(ls, val) + sum(ds, devVal))}</div>${ls.map(card).join('') || '<div class="small muted" style="padding:8px">Nothing here. Drag a card in.</div>'}</div>`; };
    // demand vs on hand, like for like
    const to = addMonths(t, S().warnMonths), need = new Map(), have = new Map(), nameOf = id => DB.get('models', id)?.name || '';
    d.hardware.filter(isActiveLine).forEach(h => { const p = plannedDate(h); if (p && p <= to && h.modelId) need.set(h.modelId, (need.get(h.modelId) || 0) + qty(h)); });
    lines.forEach(l => { if (l.modelId) have.set(l.modelId, (have.get(l.modelId) || 0) + qty(l)); });
    devs.forEach(x => { const m = d.models.find(m => m.name.toLowerCase() === (x.model || '').toLowerCase()); if (m) have.set(m.id, (have.get(m.id) || 0) + 1); });
    const ids = [...new Set([...need.keys(), ...have.keys()])].sort((a, b) => cmp(nameOf(a), nameOf(b)));
    const secs = [
      { id: 'kpis', title: 'Stock summary', html: `<div class="kpis">
        <div class="kpi infok"><span class="ico">${ic('package')}</span><span><div class="v">${fmtNum(units)}</div><div class="l">Units in stock</div><div class="s">${money(worth)} at cost</div></span></div>
        <div class="kpi good"><span class="ico">${ic('checkin')}</span><span><div class="v">${fmtNum(ready)}</div><div class="l">Ready to deploy</div></span></div>
        <div class="kpi warnk"><span class="ico">${ic('tool')}</span><span><div class="v">${fmtNum(prepping)}</div><div class="l">Being prepped</div></span></div>
        <div class="kpi"><span class="ico">${ic('clock')}</span><span><div class="v">${fmtNum(raw)}</div><div class="l">Awaiting prep (boxed)</div></span></div>
        <div class="kpi"><span class="ico">${ic('tag')}</span><span><div class="v">${fmtNum(reserved)}</div><div class="l">Reserved for labs</div></span></div></div>` },
      { id: 'loc', title: 'By location', note: 'Drag a card to another location to move the whole line; use Move… for part of it', html: `<div style="display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,1fr);gap:12px;overflow:auto;padding-bottom:8px" id="inv-board">${cols.map(col).join('')}</div>` },
      { id: 'dev', title: 'Individual devices in stock', html: `<div class="card">${devs.length ? `<div class="tbl-wrap"><table><thead><tr><th>Device</th><th>Model</th><th>Serial</th><th>Status</th><th>Location</th><th></th></tr></thead><tbody>${devs.map(x => `<tr><td><a href="#/device/${x.id}">${esc(x.name || x.assetTag || x.id)}</a></td><td>${esc(x.model || '')}</td><td>${esc(x.serial || '')}</td><td><span class="badge ${devStatus(x) === 'Ready to deploy' ? 'ok' : 'warn'}">${esc(devStatus(x))}</span></td><td><select data-dloc="${x.id}"${DB.readOnly || DB.confirmOnly ? ' disabled' : ''}>${optionsHTML(['', ...locs].map(v => ({ v, l: v || '(not set)' })), x.stockLoc || '')}</select></td><td class="edit-only"><button class="btn sm" data-ddep="${x.id}">Deploy…</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No individual devices are waiting. A device appears here when it has no lab and its status is Ready to deploy or Pending.</div>'}</div>` },
      { id: 'demand', title: 'Stock vs. what is coming due', note: `Like-for-like: assumes each replacement uses the same model; looks ${S().warnMonths} months ahead`, html: `<div class="card">${ids.length ? `<div class="tbl-wrap"><table><thead><tr><th>Model</th><th class="num">Due for replacement</th><th class="num">In stock</th><th>Cover</th></tr></thead><tbody>${ids.map(id => { const n = need.get(id) || 0, h = have.get(id) || 0; return `<tr><td>${esc(nameOf(id))}</td><td class="num">${n}</td><td class="num">${h}</td><td>${n ? (h >= n ? '<span class="badge ok">Covered</span>' : `<span class="badge ${h ? 'warn' : 'bad'}">Short ${n - h}</span>`) : '<span class="muted">Nothing due</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Nothing due and nothing in stock.</div>'}</div>` }
    ];
    el.innerHTML = pageHead('Inventory (stock)', `<button class="btn edit-only" id="inv-loc">Locations…</button><button class="btn primary edit-only" id="inv-new">${ic('plus')} Receive stock</button>`, 'Inventory') + dashLayout('inventory', secs);
    kanbanDnD($('#inv-board', el), 'stock', cols.filter(c => c !== 'No location'), '', { field: 'location', move: (l, to) => { moveStock(l, to, l.qty); toast('Moved to ' + to); } });
    $('#inv-new', el).onclick = () => editEntity('stock'); $('#inv-loc', el).onclick = manageLocationsDialog;
    el.onclick = e => {
      const t2 = e.target, m = t2.closest('[data-move]'), dp = t2.closest('[data-dep]'), dd = t2.closest('[data-ddep]'), ed = t2.closest('[data-e]');
      if (m) return moveStockDialog(m.dataset.move); if (dp) return deployStockDialog(dp.dataset.dep); if (dd) return deployDeviceDialog(dd.dataset.ddep); if (ed) editEntity('stock', ed.dataset.e);
    };
    el.onchange = e => { const s = e.target.closest('[data-dloc]'); if (s) { DB.put('devices', { ...DB.get('devices', s.dataset.dloc), stockLoc: s.value }); toast('Location saved'); } };
  }
};
