// Import from the old Microsoft Lists tracker (CSV or .xlsx). One row = one lab/cart/single + model + quantity.
// Matching is by column heading (spaces, case and symbols ignored, so "Room #" and "Building {Choice}" are recognised).
const INV_FIELDS = [
  { k: 'building', label: 'Building', req: true, alias: ['building', 'buildingchoice', 'buildingname', 'site', 'campus'] },
  { k: 'room', label: 'Room #', req: true, alias: ['room', 'roomnumber', 'roomno', 'roomnum', 'labroom'] },
  { k: 'labName', label: 'Lab name', alias: ['labname', 'name', 'title', 'roomname'] },
  { k: 'convention', label: 'Naming convention → device-match keywords', alias: ['namingconvention', 'namingconv', 'devicenaming', 'hostnamepattern', 'namingpattern'] },
  { k: 'labType', label: 'Lab / Cart / Single', alias: ['labcartsingle', 'labcart', 'labtype', 'locationtype'] },
  { k: 'department', label: 'Departments { Colleges }', alias: ['departmentscolleges', 'departments', 'department', 'dept', 'college', 'colleges', 'owner'] },
  { k: 'manager', label: 'Lab manager → contact', alias: ['labmanager', 'manager', 'labcontact'] },
  { k: 'enrollment', label: 'Intune / Mosyle enrollment', alias: ['intunemosyleenrollment', 'enrollment', 'mdm', 'management', 'enrolledin'] },
  { k: 'state', label: 'State', alias: ['state', 'status', 'assetstate'] },
  { k: 'qty', label: 'Quantity', alias: ['quantity', 'qty', 'count', 'devices', 'numberofdevices'] },
  { k: 'deviceType', label: 'Device type', alias: ['devicetype', 'category', 'formfactor'] },
  { k: 'vendor', label: 'Vendor', alias: ['vendor', 'manufacturer', 'make', 'brand'] },
  { k: 'model', label: 'Model', req: true, alias: ['model', 'devicemodel', 'hardware', 'computer'] },
  { k: 'apps', label: 'Applications requested → software', alias: ['applicationsrequestedlookup', 'applicationsrequested', 'applications', 'software', 'apps'] },
  { k: 'chip', label: 'Chip → processor', alias: ['chip', 'cpu', 'processor'] },
  { k: 'os', label: 'Operating system', alias: ['operatingsystem', 'os'] },
  { k: 'ram', label: 'RAM', alias: ['ram', 'memory', 'ramgb'] }, { k: 'storage', label: 'Storage', alias: ['storage', 'storagegb', 'disk', 'harddrive'] },
  { k: 'lastReplaced', label: 'Last refreshed', alias: ['lastrefreshed', 'lastreplaced', 'lastreplacement', 'lastreplacementdate', 'refreshdate', 'purchasedate'] },
  { k: 'cycle', label: 'Replacement cycle (years)', alias: ['replacementcycle', 'lifecycle', 'cycle', 'refreshcycle', 'lifecycleyears'] },
  { k: 'warranty', label: 'Warranty expiration', alias: ['warrantyexpiration', 'warrantyenddate', 'warrantyend', 'warranty'] },
  { k: 'calcDate', label: 'Calculated replacement date', alias: ['calculatedreplacementdate', 'nextreplacement', 'nextrefresh'] },
  { k: 'plannedYear', label: 'Planned replacement year', alias: ['plannedreplacementyear', 'replacementyear', 'plannedyear', 'plannedreplacement', 'plannedreplacementdate'] },
  { k: 'unitCost', label: 'Cost per item', alias: ['costperitem', 'unitcost', 'cost', 'price', 'costperunit'] },
  { k: 'totalCost', label: 'Total cost', alias: ['totalcost', 'total'] },
  { k: 'po', label: 'Current purchase order #', alias: ['currentpurchaseorder', 'currentpo', 'purchaseorder', 'po', 'ponumber'] },
  { k: 'repPO', label: 'Replacement purchase order #', alias: ['replacementpurchaseorder', 'replacementpo'] },
  { k: 'refreshStatus', label: 'Refresh status', alias: ['refreshstatus', 'replacementstatus'] },
  { k: 'assetId', label: 'Compliance asset ID', alias: ['complianceassetid', 'assetid', 'assettag'] },
  { k: 'lsCount', label: 'LabStats count', alias: ['labstatscount', 'labstats'] }, { k: 'snCount', label: 'ServiceNow count', alias: ['servicenowcount', 'servicenow'] },
  { k: 'snVerified', label: 'Location verified in ServiceNow', alias: ['locationverifiedinservicenow', 'verifiedinservicenow'] }, { k: 'physical', label: 'Physical count', alias: ['physicalcount', 'physicalqty', 'auditcount'] }
];
// the headings of the old tracker, for the template download
const LEGACY_HEADINGS = ['Naming Convention', 'Intune/Mosyle Enrollment', 'State', 'Quantity', 'Device Type', 'Lab/Cart/Single', 'Vendor', 'Model', 'Room #', 'Building', 'Applications Requested Lookup', 'Chip', 'Last Refreshed', 'Replacement Cycle', 'Warranty Expiration', 'Calculated Replacement Date', 'Planned Replacement Year', 'Operating System', 'Cost Per Item', 'Total Cost', 'Lab Manager', 'Current Purchase Order #', 'Replacement Purchase Order #', 'Refresh Status', 'Compliance Asset Id', 'Lab Stats Count', 'Service Now Count', 'Departments { Colleges }', 'Location Verified in ServiceNow', 'Physical Count'];

const legacyPlatform = o => {
  const t = `${o.os} ${o.vendor} ${o.enrollment} ${o.model} ${o.chip}`;
  if (/mac|apple|imac|\bm[1-4]\b/i.test(t) || /mosyle/i.test(o.enrollment) && !/intune/i.test(o.enrollment)) return 'Mac';
  if (/windows|dell|hp\b|lenovo|optiplex|thinkcentre|elitedesk|surface|intel|amd/i.test(t) || /intune/i.test(o.enrollment)) return 'Windows';
  return 'Other';
};
const convKeyword = s => String(s || '').replace(/\{[^}]*\}/g, '').replace(/[#xX*?%\d]+[\s\-_]*$/, '').replace(/[\s\-_]+$/, '').trim();
const legacyCategory = s => { const t = String(s || '').toLowerCase(); return /laptop|notebook|macbook/.test(t) ? 'Laptop' : /all.?in.?one|aio|imac/.test(t) ? 'All-in-one' : /workstation|studio|precision/.test(t) ? 'Workstation' : /tablet|ipad/.test(t) ? 'Tablet' : /desktop|tower|mini|sff/.test(t) ? 'Desktop' : s ? 'Other' : ''; };
const legacyEnrollment = s => { const t = String(s || '').toLowerCase(); return !t ? '' : /both|intune.*mosyle|mosyle.*intune/.test(t) ? 'Both' : /intune/.test(t) ? 'Intune' : /mosyle/.test(t) ? 'Mosyle' : /^(no|none|n\/a|not|un)/.test(t) ? 'Unmanaged' : ''; };
const splitList = s => { s = String(s || '').trim(); if (!s) return []; return (/[;\n]/.test(s) ? s.split(/[;\n]+/) : s.split(/,(?![^(]*\))/)).map(x => x.trim()).filter(Boolean); };
const parseContact = s => { s = String(s || '').trim(); if (!s) return null; const m = /^(.*?)\s*[<(]?([\w.+-]+@[\w.-]+\.\w+)[>)]?\s*$/.exec(s); if (m) return { name: m[1].replace(/[;,]$/, '').trim() || m[2].split('@')[0].replace(/[._]/g, ' '), email: m[2] }; return { name: s.replace(/;$/, ''), email: '' }; };
const truthy = s => /^(y|yes|true|1|x|verified|✓)/i.test(String(s || '').trim());

function findHeaderRow(rows) {
  let best = 0, bestN = -1;
  rows.slice(0, 10).forEach((r, i) => { const n = r.filter(c => INV_FIELDS.some(f => f.alias.includes(normH(c)))).length; if (n > bestN) { best = i; bestN = n; } });
  return best;
}
function legacyTable(rows) {
  const h = findHeaderRow(rows), headers = (rows[h] || []).map(x => String(x).trim());
  return { headers, rows: rows.slice(h + 1).map(r => Object.fromEntries(headers.map((x, i) => [x, String(r[i] ?? '').trim()]))) };
}
const legacyRows = I => I.parsed.rows.map(r => { const o = {}; INV_FIELDS.forEach(f => o[f.k] = I.map[f.k] ? (r[I.map[f.k]] || '').trim() : ''); o._raw = r; if (!o.room && /single/i.test(o.labType)) o.room = 'Singles'; return o; }).filter(o => o.building && o.room && o.model);    // single devices with no room are grouped into a "Singles" entry per building

function inventoryImport(host) {
  const I = UI.impInv ??= { extras: true };
  const draw = () => {
    const rs = I.parsed ? legacyRows(I) : [], mapped = new Set(Object.values(I.map || {})), unmapped = (I.parsed?.headers || []).filter(h => h && !mapped.has(h));
    const have = n => DB.data[n], key = s => String(s).toLowerCase();
    const newB = new Set(), newL = new Set(), newM = new Set(), newS = new Set(), newC = new Set();
    rs.forEach(o => {
      if (!have('buildings').some(b => key(b.name) === key(o.building) || key(b.code || '') === key(o.building))) newB.add(key(o.building));
      if (!have('labs').some(l => key(l.room) === key(o.room) && key(DB.get('buildings', l.buildingId)?.name || '') === key(o.building))) newL.add(key(o.building + '|' + o.room));
      if (!have('models').some(m => key(m.name) === key(o.model))) newM.add(key(o.model));
      splitList(o.apps).forEach(a => { if (!have('software').some(s => key(s.name) === key(a))) newS.add(key(a)); });
      const c = parseContact(o.manager); if (c && !have('contacts').some(x => key(x.name) === key(c.name))) newC.add(key(c.name));
    });
    host.innerHTML = `<div class="card"><p class="small muted">Bring in your old Microsoft Lists tracker: export the list to <b>CSV</b> (or Excel) and drop it here. Each row becomes a hardware line; buildings, labs, models, software titles and lab-manager contacts are created when they don’t exist, and the <b>Naming Convention</b> column becomes the lab’s device-match keywords so Intune / Mosyle devices find their room. Importing again updates the same lines (matched by lab + model), so you can fix the list and re-run it.</p>
    <p class="chips"><button class="btn sm" id="tpl">Download a template with your headings</button></p>
    <div class="drop" id="drop"><p><b>Drop the exported list here</b> or <label style="color:var(--accent);cursor:pointer;text-decoration:underline">choose a file<input type="file" id="file" accept=".csv,.xlsx,.txt,.tsv" hidden></label></p><p class="small">.csv and .xlsx are read in your browser – nothing is uploaded.</p></div>
    ${I.parsed ? `<h3 style="margin-top:16px">${esc(I.fileName)} – ${rs.length} usable rows of ${I.parsed.rows.length}</h3>
    <details open><summary class="small muted" style="cursor:pointer">Column mapping (check it looks right)</summary>${mappingHTML(I.parsed.headers, INV_FIELDS, I.map)}</details>
    ${unmapped.length ? `<p class="small muted">Not mapped: ${unmapped.map(u => `<span class="pill">${esc(u)}</span>`).join('')}</p><label class="chk"><input type="checkbox" id="ex"${I.extras ? ' checked' : ''}> Keep unmapped columns in each line’s notes so nothing is lost</label>` : ''}
    <div class="chips" style="margin:12px 0"><span class="badge info">${newB.size} new buildings</span><span class="badge info">${newL.size} new labs</span><span class="badge info">${newM.size} new models</span><span class="badge info">${newS.size} new software titles</span><span class="badge info">${newC.size} new contacts</span></div>
    <div class="tbl-wrap" style="max-height:280px"><table><thead><tr><th>Building</th><th>Room</th><th>Model</th><th class="num">Qty</th><th class="num">Unit cost</th><th>Last refreshed</th><th>Planned</th><th>Apps</th><th>Manager</th></tr></thead><tbody>${rs.slice(0, 60).map(o => `<tr><td>${esc(o.building)}</td><td>${esc(o.room)}</td><td>${esc(o.model)}</td><td class="num">${esc(o.qty || 1)}</td><td class="num">${o.unitCost ? money(num(o.unitCost)) : o.totalCost && num(o.qty) ? money(num(o.totalCost) / num(o.qty)) : '—'}</td><td>${fmtDate(normDate(o.lastReplaced))}</td><td>${esc(o.plannedYear || '')}</td><td>${splitList(o.apps).length || ''}</td><td>${esc(o.manager || '')}</td></tr>`).join('')}</tbody></table></div>
    <p><button class="btn primary edit-only" id="apply"${rs.length ? '' : ' disabled'}>Import ${rs.length} rows</button></p>` : ''}</div>`;
    $('#tpl', host).onclick = () => download('lab-tracker-import-template.csv', toCSV([LEGACY_HEADINGS, ['SMI204-PC##', 'Intune', 'Active', '36', 'Desktop', 'Lab', 'Dell', 'OptiPlex 7020 SFF', '204', 'Smith Hall', 'Microsoft 365; Google Chrome; SPSS', 'Intel Core i5', '2022-08-15', '4', '2026-08-15', '2026-08-15', '2026', 'Windows 11', '1150', '41400', 'Jane Doe <jane.doe@example.edu>', 'PO-12345', '', 'Planned', '', '36', '36', 'Academic Technology', 'Yes', '35']]));
    const drop = $('#drop', host), inp = $('#file', host);
    const go = async f => {
      if (!f) return; I.fileName = f.name;
      try {
        const rows = /\.xlsx$/i.test(f.name) ? await readXlsx(await f.arrayBuffer()) : parseCSV(await readFileText(f));
        if (/\.xls$/i.test(f.name)) throw new Error('Old .xls files can’t be read – save as .xlsx or CSV.');
        I.parsed = legacyTable(rows); I.map = autoMap(I.parsed.headers, INV_FIELDS);
        if (!I.map.building || !I.map.room || !I.map.model) toast('Some key columns (building, room, model) weren’t recognised – check the mapping.', 'err');
        draw();
      } catch (e) { toast(e.message, 'err'); }
    };
    inp.onchange = () => go(inp.files[0]); drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over'); drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); go(e.dataTransfer.files[0]); };
    host.onchange = e => { if (e.target.dataset.map !== undefined) { I.map[e.target.dataset.map] = e.target.value; draw(); } else if (e.target.id === 'ex') I.extras = e.target.checked; };
    const ap = $('#apply', host);
    if (ap) ap.onclick = () => { const res = applyLegacyRows(rs, I, unmapped); DB.log(`Imported old tracker ${I.fileName}: ${res.summary}`); toast(res.summary); UI.impInv = { extras: I.extras }; location.hash = '#/labs'; };
  };
  draw();
}

function applyLegacyRows(rs, I, unmapped) {
  const c = { b: 0, l: 0, lines: 0, upd: 0, s: 0, ct: 0, dev: 0 }, lc = s => String(s).toLowerCase(), labsTouched = new Set();
  rs.forEach(o => {
    // building + lab
    let b = DB.data.buildings.find(x => lc(x.name) === lc(o.building) || lc(x.code || '') === lc(o.building)); if (!b) { b = DB.put('buildings', { name: o.building, code: '' }); c.b++; }
    let lab = DB.data.labs.find(x => x.buildingId === b.id && lc(x.room) === lc(o.room)); const isNew = !lab;
    const type = /cart/i.test(o.labType) ? 'Cart / mobile' : /single/i.test(o.labType) ? 'Other' : /lab/i.test(o.labType) ? 'Computer lab' : '';
    const kw = convKeyword(o.convention), seats = null;
    if (isNew) { lab = DB.put('labs', { buildingId: b.id, room: o.room, name: o.labName || '', department: o.department || '', type: type || 'Computer lab', status: 'Active', match: [kw, ((b.code || '') + o.room).replace(/\s/g, '')].filter(Boolean).join(', '), contactIds: [], seats, labStatsCount: o.lsCount ? num(o.lsCount) : null }); c.l++; }
    else {
      const set = new Set((lab.match || '').split(',').map(x => x.trim()).filter(Boolean)); if (kw) set.add(kw);
      lab = DB.put('labs', { ...lab, match: [...set].join(', '), department: lab.department || o.department || '', name: lab.name || o.labName || '', type: lab.type || type || 'Computer lab', labStatsCount: lab.labStatsCount ?? (o.lsCount ? num(o.lsCount) : null) });
    }
    labsTouched.add(lab.id);
    // manager -> contact
    const mc = parseContact(o.manager);
    if (mc) {
      let ct = DB.data.contacts.find(x => lc(x.name) === lc(mc.name) || (mc.email && lc(x.email || '') === lc(mc.email)));
      if (!ct) { ct = DB.put('contacts', { name: mc.name, email: mc.email, role: 'Lab manager', type: 'Department', platform: 'Any' }); c.ct++; }
      if (!(lab.contactIds || []).includes(ct.id)) lab = DB.put('labs', { ...lab, contactIds: [...(lab.contactIds || []), ct.id] });
    }
    // model
    const plat = legacyPlatform(o), m = findOrCreateModel(o.model, plat, o.vendor), mp = {};
    if (o.vendor && !m.manufacturer) mp.manufacturer = o.vendor; if (o.chip && !m.cpu) mp.cpu = o.chip; if (o.os && !m.os) mp.os = o.os; const cat = legacyCategory(o.deviceType); if (cat && !m.category) mp.category = cat;
    if (o.ram && !m.ramGB) mp.ramGB = parseGB(o.ram); if (o.storage && !m.storageGB) mp.storageGB = parseGB(o.storage);
    const qty = num(o.qty) || 1, unit = o.unitCost ? num(o.unitCost) : (o.totalCost ? num(o.totalCost) / qty : null);
    if (unit && !(+m.unitCost)) mp.unitCost = Math.round(unit * 100) / 100;
    if (Object.keys(mp).length) DB.put('models', { ...m, ...mp });
    // dates
    const cycle = o.cycle ? num(o.cycle) : null; let last = normDate(o.lastReplaced); const calc = normDate(o.calcDate);
    if (!last && calc && cycle) last = addYears(calc, -cycle);
    const calcDate = calc || (last && cycle ? addYears(last, cycle) : ''); let override = '';
    const py = (String(o.plannedYear).match(/(19|20)\d{2}/) || [])[0];
    if (py && !(calcDate && calcDate.slice(0, 4) === py)) override = py + '-' + (calcDate ? calcDate.slice(5) : '07-01');
    // line
    const state = /retire|surplus|dispos|decommission|inactive/i.test(o.state) ? 'Retired' : /spare|stock|storage/i.test(o.state) ? 'Spare' : 'In service';
    const extra = I.extras ? unmapped.map(h => o._raw[h] ? `${h}: ${o._raw[h]}` : '').filter(Boolean).join(' · ') : '';
    const ex = DB.data.hardware.find(x => x.labId === lab.id && x.modelId === m.id);
    const rec = { labId: lab.id, modelId: m.id, platform: plat, qty, unitCost: unit, os: o.os, purchaseDate: last, lastReplaced: last, lifecycleYears: cycle, plannedOverride: override, status: state, enrollment: legacyEnrollment(o.enrollment), fundingRef: o.po, replacementPO: o.repPO, refreshStatus: o.refreshStatus,
      complianceAssetId: o.assetId, warrantyEnd: normDate(o.warranty), physicalCount: o.physical !== '' ? num(o.physical) : null, serviceNowCount: o.snCount !== '' ? num(o.snCount) : null, snVerified: o.snVerified ? truthy(o.snVerified) : undefined, legacyState: o.state, notes: extra };
    Object.keys(rec).forEach(k => { if ((rec[k] === '' || rec[k] == null || rec[k] === undefined) && ex) delete rec[k]; });
    DB.put('hardware', { ...(ex || {}), ...rec }); ex ? c.upd++ : c.lines++;
    // applications -> software + lab software
    splitList(o.apps).forEach(a => {
      let sw = DB.data.software.find(s => lc(s.name) === lc(a));
      if (!sw) { sw = DB.put('software', { name: a, platforms: plat === 'Other' ? [] : [plat] }); c.s++; }
      else if (plat !== 'Other' && !(sw.platforms || []).includes(plat)) sw = DB.put('software', { ...sw, platforms: [...(sw.platforms || []), plat] });
      if (!DB.data.labSoftware.some(x => x.labId === lab.id && x.softwareId === sw.id)) DB.put('labSoftware', { labId: lab.id, softwareId: sw.id });
    });
    // warranty -> devices already imported for this lab/model
    const we = normDate(o.warranty);
    if (we) DB.data.devices.filter(d => d.labId === lab.id && (d.model || '').toLowerCase() === lc(o.model) && !d.warrantyEnd).forEach(d => { saveWarranty(d, { end: we, start: '', product: '' }, 'Old tracker'); c.dev++; });
  });
  labsTouched.forEach(id => { const lab = DB.get('labs', id); if (lab && !(+lab.seats)) { const q = sum(DB.data.hardware.filter(h => h.labId === id && isActiveLine(h)), h => +h.qty || 0); if (q) DB.put('labs', { ...lab, seats: q }); } });    // seats default to the quantity on record
  return { ...c, summary: `${c.lines} new + ${c.upd} updated lines · ${c.l} new labs · ${c.b} buildings · ${c.s} software titles · ${c.ct} contacts${c.dev ? ` · warranty set on ${c.dev} devices` : ''}` };
}
