// Derived values and business rules.
const PLATFORMS = ['Windows', 'Mac', 'Other'];
const S = () => DB.data.settings;
const memo = (k, fn) => { const c = UI.memo[k]; if (c && c.m === DB.mut) return c.v; const v = fn(); UI.memo[k] = { m: DB.mut, v }; return v; };

const isActiveLine = l => (l.status || 'In service') === 'In service';
const getModel = l => DB.get('models', l.modelId);
const modelName = l => getModel(l)?.name || 'Unknown model';
const platformOf = l => l.platform || getModel(l)?.platform || 'Other';
const unitCostOf = l => (l.unitCost != null && l.unitCost !== '') ? +l.unitCost : (+getModel(l)?.unitCost || 0);
const lineCost = l => (+l.qty || 0) * unitCostOf(l);
const lifecycleYears = l => num(l.lifecycleYears) || num(getModel(l)?.lifecycleYears) || S().lifecycle[platformOf(l)] || 5;
const ageBase = l => l.lastReplaced || l.purchaseDate || '';
function plannedDate(l) {
  if (l.plannedOverride) return l.plannedOverride;
  const b = ageBase(l); return b ? addYears(b, lifecycleYears(l)) : '';
}
function lineState(l) {
  if (!isActiveLine(l)) return l.status || 'Retired';
  const p = plannedDate(l); if (!p) return 'No date';
  const t = todayStr(); if (p < t) return 'Overdue';
  return p <= addMonths(t, S().warnMonths) ? 'Due soon' : 'OK';
}
const stateBadge = s => `<span class="badge ${{ Overdue: 'bad', 'Due soon': 'warn', OK: 'ok', 'No date': '' }[s] || ''}">${esc(s)}</span>`;

const buildingName = b => b ? (b.code || b.name) : '?';
function labLabel(lab) {
  if (!lab) return '—';
  return `${buildingName(DB.get('buildings', lab.buildingId))} ${lab.room}`.trim() + (lab.name ? ` · ${lab.name}` : '');
}
const labOptions = () => DB.data.labs.map(l => ({ v: l.id, l: labLabel(l) })).sort((a, b) => cmp(a.l, b.l));
const buildingOptions = () => DB.data.buildings.map(b => ({ v: b.id, l: b.name })).sort((a, b) => cmp(a.l, b.l));
const contactOptions = () => DB.data.contacts.map(c => ({ v: c.id, l: `${c.name}${c.role ? ' – ' + c.role : ''}` })).sort((a, b) => cmp(a.l, b.l));

const group = (arr, f) => { const m = new Map(); arr.forEach(x => { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; };
const linesByLab = () => memo('linesByLab', () => group(DB.data.hardware, l => l.labId));
const devicesByLab = () => memo('devicesByLab', () => group(DB.data.devices, d => d.labId));
const swByLab = () => memo('swByLab', () => group(DB.data.labSoftware, x => x.labId));

function labPlatforms(lab) {
  const lines = (linesByLab().get(lab.id) || []).filter(isActiveLine);
  const set = new Set(lines.map(platformOf));
  if (!set.size) (devicesByLab().get(lab.id) || []).forEach(d => set.add(d.platform || 'Other'));
  return [...set].sort();
}
const labPlatformText = lab => { const p = labPlatforms(lab); return p.length > 1 ? 'Mixed' : (p[0] || '—'); };

function labStats(lab) {
  return memo('ls' + lab.id, () => {
    const lines = (linesByLab().get(lab.id) || []).filter(isActiveLine);
    const devs = devicesByLab().get(lab.id) || [];
    const dates = lines.map(plannedDate).filter(Boolean).sort();
    return {
      lines, devs, qty: sum(lines, l => +l.qty || 0), cost: sum(lines, lineCost), managed: devs.length,
      next: dates[0] || '', overdue: lines.filter(l => lineState(l) === 'Overdue').length
    };
  });
}
function softwareForLab(labId) {
  return (swByLab().get(labId) || []).map(ls => ({ ls, sw: DB.get('software', ls.softwareId) })).filter(x => x.sw);
}
function contactsForLab(lab) {
  const map = new Map();
  const add = (c, why) => { if (!c) return; const e = map.get(c.id) || { c, why: [] }; if (!e.why.includes(why)) e.why.push(why); map.set(c.id, e); };
  (lab.contactIds || []).forEach(id => add(DB.get('contacts', id), 'Lab contact'));
  softwareForLab(lab.id).forEach(({ sw }) => (sw.contactIds || []).forEach(id => add(DB.get('contacts', id), 'Software: ' + sw.name)));
  const plats = labPlatforms(lab);
  DB.data.contacts.forEach(c => {
    if (!c.platformDefault) return;
    if (!c.platform || c.platform === 'Any') add(c, 'All labs');
    else if (plats.includes(c.platform)) add(c, 'Platform: ' + c.platform);
  });
  return [...map.values()];
}

// ---------- replacement plan ----------
function replacementPlan({ from, to, overdue = true, platform = '', buildingId = '' }) {
  const t = todayStr(), groups = new Map();
  for (const l of DB.data.hardware) {
    if (!isActiveLine(l)) continue;
    const p = plannedDate(l); if (!p) continue;
    const inRange = p >= from && p <= to;
    if (!inRange && !(overdue && p < from)) continue;
    if (platform && platformOf(l) !== platform) continue;
    const lab = DB.get('labs', l.labId); if (!lab) continue;
    if (buildingId && lab.buildingId !== buildingId) continue;
    const g = groups.get(lab.id) || { lab, lines: [], qty: 0, cost: 0, first: p };
    const flag = p < t ? 'Overdue' : (p < from ? 'Carry-over' : 'Scheduled');
    g.lines.push({ line: l, planned: p, cost: lineCost(l), flag });
    g.qty += +l.qty || 0; g.cost += lineCost(l); if (p < g.first) g.first = p;
    groups.set(lab.id, g);
  }
  const labs = [...groups.values()].sort((a, b) => cmp(a.first, b.first) || cmp(labLabel(a.lab), labLabel(b.lab)));
  labs.forEach(g => g.lines.sort((a, b) => cmp(a.planned, b.planned)));
  return { labs, qty: sum(labs, g => g.qty), cost: sum(labs, g => g.cost), lines: labs.flatMap(g => g.lines.map(x => ({ ...x, lab: g.lab }))) };
}

// ---------- OS / platform helpers ----------
function friendlyOS(os, ver) {
  const o = (os || '').trim(), v = (ver || '').trim();
  if (/mac|os ?x/i.test(o)) {
    const parts = v.split('.'), m = +parts[0] || 0;
    const names = { 11: 'Big Sur', 12: 'Monterey', 13: 'Ventura', 14: 'Sonoma', 15: 'Sequoia', 26: 'Tahoe' };
    if (m === 10) return { 15: 'macOS Catalina 10.15', 14: 'macOS Mojave 10.14' }[`10.${parts[1]}`] || `macOS 10.${parts[1] || 'x'}`;
    return names[m] ? `macOS ${names[m]} ${m}` : (m ? `macOS ${m}` : 'macOS');
  }
  if (/windows/i.test(o) || /^10\.0\.\d+/.test(v)) {
    const b = +((v.match(/^10\.0\.(\d+)/) || [])[1] || 0);
    if (b >= 22000) return 'Windows 11'; if (b) return 'Windows 10';
    if (/11/.test(o)) return 'Windows 11'; if (/10/.test(o)) return 'Windows 10';
    return o || 'Windows';
  }
  return o || 'Unknown';
}
function platformFrom(osRaw, ver, source, model) {
  const s = `${osRaw} ${model}`;
  if (/mac|imac|os ?x/i.test(s)) return 'Mac';
  if (/windows|^10\.0\./i.test(osRaw + ' ' + ver)) return 'Windows';
  if (/ios|ipad|android|chrome|linux/i.test(osRaw)) return 'Other';
  if (source === 'Mosyle') return 'Mac';
  if (source === 'Intune') return 'Windows';
  return 'Other';
}
function findOrCreateModel(name, platform, manufacturer) {
  name = (name || '').trim(); if (!name) return null;
  let m = DB.data.models.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!m) m = DB.put('models', { name, platform: platform || 'Other', manufacturer: manufacturer || '', unitCost: null, lifecycleYears: null });
  return m;
}

// ---------- device -> lab matching ----------
// Order: (1) lab match keywords, (2) your naming patterns, (3) building + room tokens anywhere in name/location/tags,
// (4) a generic "BLDG-ROOM-xx" guess at the start of the name. Building names, codes and aliases all count.
const normKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normRoom = s => normKey(s).replace(/^0+(?=[0-9])/, '');
function patternToRegex(p) {
  const map = { bldg: '(?<bldg>[A-Za-z]+)', room: '(?<room>[A-Za-z0-9]+)', n: '\\d+', any: '.*', type: '[A-Za-z]+' };
  try {
    const src = String(p).trim().split(/(\{\w+\})/).map(t => { const m = /^\{(\w+)\}$/.exec(t); return m && map[m[1]] ? map[m[1]] : t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('');
    return src ? new RegExp('^' + src, 'i') : null;
  } catch { return null; }
}
const namePrefix = n => String(n || '').replace(/[-_ .]?(pc|mac|imac|win|lt|wks|ws|mini|desktop|laptop|dt)?[-_ .]?\d+$/i, '').trim();
function buildLabMatcher() {
  const bKeys = new Map(), bById = new Map();
  DB.data.buildings.forEach(b => {
    const keys = [b.code, b.name, ...(b.aliases || '').split(/[,;]/)].map(normKey).filter(Boolean);
    bById.set(b.id, { b, keys }); keys.forEach(k => { if (!bKeys.has(k)) bKeys.set(k, b.id); });
  });
  const labByBR = new Map();
  const labs = DB.data.labs.map(lab => {
    const bi = bById.get(lab.buildingId), roomN = normRoom(lab.room);
    if (bi && roomN) labByBR.set(lab.buildingId + '|' + roomN, lab);
    return { lab, roomN, roomRaw: normKey(lab.room), keys: bi ? bi.keys : [], bName: (bi?.b.name || '').toLowerCase(), kws: (lab.match || '').split(/[,\n;]/).map(s => s.trim().toLowerCase()).filter(Boolean) };
  });
  const pats = (S().namePatterns || []).map(patternToRegex).filter(Boolean);
  const guess = /^([A-Za-z]{2,8})[-_ .]?0*([0-9]{1,4}[A-Za-z]?)(?=[-_ .]|$|[A-Za-z]{1,4}\d)/;
  const tryBR = (bk, rm) => { const bid = bKeys.get(normKey(bk)); return bid ? (labByBR.get(bid + '|' + normRoom(rm)) || null) : null; };
  const resolve = d => {
    const fields = [d.name, d.location, d.tags, d.group].filter(Boolean);
    const hay = fields.join(' | ').toLowerCase();
    let best = null, bestLen = 0;
    for (const m of labs) for (const k of m.kws) if (hay.includes(k) && k.length > bestLen) { best = m.lab; bestLen = k.length; }
    if (best) return { lab: best, how: 'keyword' };
    for (const re of pats) for (const s of fields) { const g = re.exec(s)?.groups; if (g?.bldg && g?.room) { const lab = tryBR(g.bldg, g.room); if (lab) return { lab, how: 'pattern' }; } }
    const tokens = new Set(hay.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean));
    for (const m of labs) {
      if (!m.roomN) continue;
      for (const k of m.keys) {
        if (tokens.has(k + m.roomRaw) || tokens.has(k + m.roomN) || ((tokens.has(m.roomRaw) || tokens.has(m.roomN)) && tokens.has(k))) return { lab: m.lab, how: 'building + room' };
      }
      if ((tokens.has(m.roomRaw) || tokens.has(m.roomN)) && m.bName && hay.includes(m.bName)) return { lab: m.lab, how: 'building + room' };
    }
    for (const s of [d.name, d.location]) { const g = guess.exec(s || ''); if (g) { const lab = tryBR(g[1], g[2]); if (lab) return { lab, how: 'name guess' }; } }
    return { lab: null, how: '' };
  };
  const f = d => resolve(d).lab; f.full = resolve;
  return f;
}
function relinkDevices() {
  const m = buildLabMatcher(); let n = 0;
  DB.data.devices.slice().forEach(d => {
    if (d.labLocked) return;
    const lab = m({ name: d.name, location: d.location, tags: d.tags || d.group });
    if (lab && lab.id !== d.labId) { DB.put('devices', { ...d, labId: lab.id }); n++; }
  });
  DB.log(`Re-linked ${n} devices to labs by name`); return n;
}


// ---------- model specs & funding ----------
const fmtStorage = gb => !gb ? '' : gb >= 1000 ? `${+(gb / 1000).toFixed(2)} TB` : `${gb} GB`;
const modelSpec = m => m ? [m.cpu, m.ramGB && `${m.ramGB} GB RAM`, m.storageGB && `${fmtStorage(m.storageGB)} ${m.storageType || ''}`.trim(), m.gpu].filter(Boolean).join(' · ') : '';
const plannedFundingOf = l => l.plannedFunding || 'Replacement budget';
const fundingOptions = () => S().fundingSources || [];

// ---------- statuses, depreciation, history ----------
const DEVICE_STATUSES = ['Ready to deploy', 'Deployed', 'Pending', 'In repair', 'Archived', 'Lost / stolen'];
const STATUS_CLASS = { 'Ready to deploy': 'ok', Deployed: 'info', Pending: 'warn', 'In repair': 'warn', Archived: '', 'Lost / stolen': 'bad' };
const devStatus = d => d.status || (d.labId ? 'Deployed' : 'Ready to deploy');
const statusBadge = st => `<span class="badge dot ${STATUS_CLASS[st] || ''}">${esc(st)}</span>`;
// straight-line depreciation over the lifecycle, no salvage value
function bookValue(l) {
  const b = ageBase(l), cost = lineCost(l); if (!b) return cost;
  return Math.max(0, cost * (1 - yearsBetween(b, todayStr()) / lifecycleYears(l)));
}
function recName(t, r) {
  if (!r) return '';
  switch (t) {
    case 'labs': return labLabel(r);
    case 'hardware': return `${modelName(r)} × ${r.qty} @ ${labLabel(DB.get('labs', r.labId))}`;
    case 'labSoftware': return `${DB.get('software', r.softwareId)?.name || 'software'} @ ${labLabel(DB.get('labs', r.labId))}`;
    case 'maintenances': return r.title;
    case 'charts': case 'proposals': case 'projects': return r.title;
    case 'baselines': return r.name;
    case 'audits': return `Audit of ${labLabel(DB.get('labs', r.labId))}`;
    case 'confirmations': return `${DB.get('contacts', r.contactId)?.name || 'contact'} · ${labLabel(DB.get('labs', r.labId))}`;
    default: return r.name || r.id;
  }
}
const TABLE_LABEL = { labs: 'Lab', hardware: 'Hardware line', devices: 'Device', models: 'Model', software: 'Software', contacts: 'Contact', buildings: 'Building', labSoftware: 'Lab software', maintenances: 'Maintenance', charts: 'Pinned chart', proposals: 'Proposal', projects: 'Project', confirmations: 'Confirmation', baselines: 'Baseline', audits: 'Audit' };
const recHref = (t, id) => t === 'labs' ? `#/lab/${id}` : t === 'devices' ? `#/device/${id}` : '';
// Flatten the audit log into one row per affected record.
function activityRows(filter) {
  const rows = [];
  for (let i = DB.data.audit.length - 1; i >= 0; i--) {
    const a = DB.data.audit[i];
    if (a.i && a.i.length) a.i.forEach(it => { if (!filter || filter(it, a)) rows.push({ when: a.t, who: a.u, a: it.a, t: it.t, id: it.id, n: it.n, f: it.f, l: it.l, notes: a.n }); });
    else if (!filter) rows.push({ when: a.t, who: a.u, a: 'note', t: '', id: '', n: [...(a.n || []), ...(a.c || [])].join(' · '), f: null, notes: [] });
    if (!filter && a.m) rows.push({ when: a.t, who: a.u, a: 'note', t: '', id: '', n: `+ ${a.m} more records changed in the same save`, f: null, notes: [] });
  }
  return rows;
}
const historyFor = (t, id) => activityRows(it => it.id === id && it.t === t);
const labHistory = labId => activityRows(it => it.l === labId || it.id === labId);
function timelineHTML(rows, max = 60) {
  if (!rows.length) return '<div class="empty">No recorded changes yet.</div>';
  return `<ul class="timeline">${rows.slice(0, max).map(r => `<li><div><b>${esc(r.who || '?')}</b> <span class="muted">${r.a === 'add' ? 'created' : r.a === 'del' ? 'deleted' : r.a === 'edit' ? 'updated' : ''}</span> ${r.t ? `<span class="badge">${esc(TABLE_LABEL[r.t] || r.t)}</span> ${recHref(r.t, r.id) ? `<a href="${recHref(r.t, r.id)}">${esc(r.n)}</a>` : esc(r.n)}` : esc(r.n)} <span class="muted small">· ${new Date(r.when).toLocaleString()}</span></div>
    ${r.f ? `<div class="chg">${Object.entries(r.f).map(([k, [o, n]]) => `<b>${esc(k)}</b>: ${o ? `<s>${esc(o)}</s> → ` : ''}${esc(n || '—')}`).join(' &nbsp;·&nbsp; ')}</div>` : ''}</li>`).join('')}</ul>`;
}
const maintenancesFor = f => DB.data.maintenances.filter(f).sort((a, b) => cmp(b.startDate, a.startDate));

// ---------- demo data ----------
function seedData() {
  const d = emptyData(); let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const t = todayStr();
  const mk = (table, o) => { o.id = uid(); o._u = new Date().toISOString(); o._b = 'Demo'; d[table].push(o); return o; };
  const B = {
    smi: mk('buildings', { name: 'Smith Hall', code: 'SMI' }),
    lib: mk('buildings', { name: 'Chen Library', code: 'LIB' }),
    sci: mk('buildings', { name: 'Rivera Science Center', code: 'SCI' })
  };
  const M = {};
  [['Dell OptiPlex 7020 SFF', 'Dell', 'Windows', 1150, 4], ['Dell Precision 3680 Tower', 'Dell', 'Windows', 1950, 4], ['HP EliteDesk 800 G9', 'HP', 'Windows', 1100, 4],
  ['Lenovo ThinkCentre M90q', 'Lenovo', 'Windows', 980, 4], ['iMac 24-inch M3', 'Apple', 'Mac', 1499, 5], ['Mac mini M2', 'Apple', 'Mac', 699, 5],
  ['Mac Studio M2 Max', 'Apple', 'Mac', 2199, 5], ['MacBook Air 13 M3', 'Apple', 'Mac', 1099, 4]
  ].forEach(([n, mf, pl, c, y]) => M[n] = mk('models', { name: n, manufacturer: mf, platform: pl, unitCost: c, lifecycleYears: null }));
  const SPEC = { 'Dell OptiPlex 7020 SFF': ['Intel Core i5-14500', 16, 512, 'NVMe SSD', 'Desktop'], 'Dell Precision 3680 Tower': ['Intel Core i7-14700', 32, 1000, 'NVMe SSD', 'Workstation'], 'HP EliteDesk 800 G9': ['Intel Core i5-12500', 16, 512, 'NVMe SSD', 'Desktop'],
    'Lenovo ThinkCentre M90q': ['Intel Core i5-13500T', 16, 512, 'NVMe SSD', 'Desktop'], 'iMac 24-inch M3': ['Apple M3', 16, 512, 'SSD', 'All-in-one'], 'Mac mini M2': ['Apple M2', 16, 512, 'SSD', 'Desktop'], 'Mac Studio M2 Max': ['Apple M2 Max', 32, 1000, 'SSD', 'Workstation'], 'MacBook Air 13 M3': ['Apple M3', 16, 512, 'SSD', 'Laptop'] };
  Object.entries(SPEC).forEach(([n, [cpu, ramGB, storageGB, storageType, category]]) => Object.assign(M[n], { cpu, ramGB, storageGB, storageType, category, family: n.replace(/ (SFF|Tower|G9|M\d.*)$/, ''), warrantyYears: 3 }));
  const C = {
    win: mk('contacts', { name: 'Dana Whitfield', role: 'Windows Systems Lead', email: 'dana.w@example.edu', platform: 'Windows', type: 'Platform lead', platformDefault: true }),
    mac: mk('contacts', { name: 'Marcus Lee', role: 'Apple Systems Admin', email: 'marcus.l@example.edu', platform: 'Mac', type: 'Platform lead', platformDefault: true }),
    adobe: mk('contacts', { name: 'Priya Natarajan', role: 'Adobe Campus Rep', email: 'priya@example.edu', platform: 'Any', type: 'Software owner' }),
    test: mk('contacts', { name: 'Tom Alvarez', role: 'Testing Center Director', email: 'tom.a@example.edu', platform: 'Windows', type: 'Department' }),
    sci: mk('contacts', { name: 'Dr. Helen Park', role: 'Science Dept Chair', email: 'h.park@example.edu', platform: 'Any', type: 'Department' }),
    fac: mk('contacts', { name: 'Facilities Desk', role: 'Furniture & power', email: 'facilities@example.edu', platform: 'Any', type: 'Facilities', platformDefault: true })
  };
  const SW = {};
  [['Microsoft 365', 'Microsoft', ['Windows', 'Mac'], 'Subscription', 28000, 'Intune/Mosyle', [C.win.id]], ['Adobe Creative Cloud', 'Adobe', ['Windows', 'Mac'], 'Subscription', 41000, 'Intune/Mosyle', [C.adobe.id]],
  ['Google Chrome', 'Google', ['Windows', 'Mac'], 'Free', 0, 'Intune/Mosyle', []], ['Respondus LockDown Browser', 'Respondus', ['Windows', 'Mac'], 'Subscription', 6500, 'Intune/Mosyle', [C.test.id]],
  ['SPSS', 'IBM', ['Windows', 'Mac'], 'Subscription', 9000, 'Manual', [C.sci.id]], ['MATLAB', 'MathWorks', ['Windows', 'Mac'], 'Site license', 12000, 'Manual', [C.sci.id]],
  ['AutoCAD', 'Autodesk', ['Windows'], 'Subscription', 7800, 'Intune', [C.win.id]], ['ChemDraw', 'Revvity', ['Windows'], 'Site license', 4200, 'Intune', [C.sci.id]],
  ['Final Cut Pro', 'Apple', ['Mac'], 'Perpetual', 0, 'Mosyle', [C.mac.id]], ['Logic Pro', 'Apple', ['Mac'], 'Perpetual', 0, 'Mosyle', [C.mac.id]],
  ['Xcode', 'Apple', ['Mac'], 'Free', 0, 'Mosyle', [C.mac.id]], ['Visual Studio', 'Microsoft', ['Windows'], 'Subscription', 3600, 'Intune', [C.win.id]]
  ].forEach(([n, v, pl, lic, cost, dep, cs], i) => SW[n] = mk('software', { name: n, vendor: v, platforms: pl, licenseType: lic, annualCost: cost, deployment: dep, contactIds: cs, version: '', licenseExpiry: i % 4 === 0 ? addMonths(t, 2) : addMonths(t, 8 + i) }));
  const labDefs = [
    ['smi', '204', 'Open Computing Lab', 'Academic Technology', 36, ['Dell OptiPlex 7020 SFF'], 5, ['Microsoft 365', 'Google Chrome', 'SPSS', 'Adobe Creative Cloud']],
    ['smi', '210', 'Design Studio', 'Art & Design', 24, ['iMac 24-inch M3'], 4.2, ['Adobe Creative Cloud', 'Microsoft 365', 'Google Chrome']],
    ['smi', '118', 'Testing Center', 'Testing Services', 30, ['HP EliteDesk 800 G9'], 3.6, ['Respondus LockDown Browser', 'Google Chrome']],
    ['lib', '101', 'Library Commons', 'Library', 48, ['Lenovo ThinkCentre M90q'], 4.4, ['Microsoft 365', 'Google Chrome']],
    ['lib', '230', 'Media Lab', 'Library', 16, ['Mac Studio M2 Max', 'Mac mini M2'], 3.1, ['Final Cut Pro', 'Logic Pro', 'Adobe Creative Cloud']],
    ['sci', '110', 'Chemistry Lab', 'Chemistry', 28, ['Dell Precision 3680 Tower'], 4.8, ['ChemDraw', 'MATLAB', 'Microsoft 365']],
    ['sci', '220', 'Data Science Lab', 'Computer Science', 32, ['Dell Precision 3680 Tower', 'iMac 24-inch M3'], 2.4, ['MATLAB', 'SPSS', 'Visual Studio', 'Xcode', 'Microsoft 365']],
    ['sci', '305', 'Video Editing Suite', 'Communications', 12, ['Mac Studio M2 Max'], 5.4, ['Final Cut Pro', 'Adobe Creative Cloud']]
  ];
  const util = [62, 71, 48, 83, 35, 22, 57, 18];
  labDefs.forEach(([bk, room, name, dept, seats, models, age, sws], li) => {
    const lab = mk('labs', { buildingId: B[bk].id, room, name, department: dept, seats, type: 'Computer lab', status: 'Active', match: `${B[bk].code}${room}`, contactIds: [], notes: '' });
    lab.usage = { hours: Math.round(seats * 40 * util[li] / 100 * 4), sessions: Math.round(seats * 22 * util[li] / 100), util: util[li], period: 'Last 90 days', importedAt: t };
    sws.forEach(s => mk('labSoftware', { labId: lab.id, softwareId: SW[s].id }));
    models.forEach((mn, mi) => {
      const m = M[mn], qty = Math.max(4, Math.round(seats / models.length));
      const last = addMonths(t, -Math.round((age + mi * 0.5) * 12 + (rnd() * 6 - 3)));
      mk('hardware', { labId: lab.id, modelId: m.id, platform: m.platform, qty, unitCost: null, os: m.platform === 'Windows' ? 'Windows 11' : 'macOS Sequoia 15', purchaseDate: last, lastReplaced: last, status: 'In service', fundingSource: pick(['Replacement budget', 'Replacement budget', 'Tech fee project']), fundingRef: rnd() > 0.6 ? 'TF-' + (2021 + Math.floor(rnd() * 4)) + '-0' + (10 + Math.floor(rnd() * 20)) : '', plannedFunding: 'Replacement budget' });
      for (let i = 1; i <= qty; i++) {
        const win = m.platform === 'Windows';
        mk('devices', {
          name: `${B[bk].code}${room}-${win ? 'PC' : 'MAC'}${pad(i + mi * 20)}`, serial: (win ? 'DL' : 'C02') + Math.random().toString(36).slice(2, 9).toUpperCase(),
          model: m.name, manufacturer: m.manufacturer, platform: m.platform, os: win ? (rnd() > 0.2 ? 'Windows 11' : 'Windows 10') : pick(['macOS Sequoia 15', 'macOS Sonoma 14', 'macOS Sequoia 15']),
          osVersion: win ? '10.0.22631.4460' : '15.1', source: win ? 'Intune' : 'Mosyle', labId: lab.id, lastCheckIn: addMonths(t, 0).slice(0, 8) + pad(1 + Math.floor(rnd() * 28 % 9)), location: '', tags: ''
        });
      }
    });
  });
  for (let i = 1; i <= 5; i++) mk('devices', { name: `LOANER-${pad(i)}`, serial: 'LN' + i + 'X' + Math.random().toString(36).slice(2, 6).toUpperCase(), model: 'MacBook Air 13 M3', manufacturer: 'Apple', platform: 'Mac', os: 'macOS Sequoia 15', osVersion: '15.1', source: 'Mosyle', labId: '', lastCheckIn: addMonths(t, -4), location: '', tags: '' });
  let tag = 0; d.devices.forEach(x => { x.assetTag = 'LAB-' + String(++tag).padStart(4, '0'); x.purchaseDate = addMonths(t, -Math.round(12 + rnd() * 50)); if (x.name.startsWith('LOANER')) x.status = 'Ready to deploy'; });
  const dv = d.devices.filter(x => x.labId);
  [[3, 'In repair', 'Repair', 'Replace failed SSD', 140], [9, 'Deployed', 'Maintenance', 'Annual cleaning & thermal paste', 0], [15, 'Deployed', 'Upgrade', 'RAM upgrade to 16 GB', 85], [22, 'Deployed', 'Repair', 'Replace cracked display', 310]].forEach(([i, st, type, title, cost], n) => {
    const dev = dv[i * 4 % dv.length]; if (st === 'In repair') dev.status = 'In repair';
    mk('maintenances', { deviceId: dev.id, labId: dev.labId, type, title, startDate: addMonths(t, -n), endDate: st === 'In repair' ? '' : addMonths(t, -n), cost, vendor: type === 'Repair' ? 'Campus Repair Depot' : '', notes: '' });
  });
  d.settings.orgName = 'Demo University';
  return d;
}
