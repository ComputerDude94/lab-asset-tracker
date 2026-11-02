// Charts page, imports (Intune / Mosyle / LabStats / CSV), settings.
VIEWS.charts = {
  render(el) {
    const C = UI.chart ??= { dataset: 'hardware', group: 'fy', split: 'platform', metric: 'cost', type: 'bar', topN: 12, filters: {} };
    const ds = DS[C.dataset];
    const kv = o => Object.entries(o).map(([v, x]) => ({ v, l: x.label }));
    el.innerHTML = pageHead('Charts') + `
    <div class="chips no-print" style="margin-bottom:12px">${CHART_PRESETS.map((p, i) => `<button class="chip" data-preset="${i}">${esc(p.title)}</button>`).join('')}</div>
    <div class="card no-print"><div class="toolbar">
      <div class="field"><label>Data</label><select id="c-ds">${optionsHTML(Object.entries(DS).map(([v, x]) => ({ v, l: x.label })), C.dataset)}</select></div>
      <div class="field"><label>Group by (X axis)</label><select id="c-group">${optionsHTML(kv(ds.groups), C.group)}</select></div>
      <div class="field"><label>Split by (colors)</label><select id="c-split"><option value="">None</option>${optionsHTML(kv(ds.groups), C.split)}</select></div>
      <div class="field"><label>Measure</label><select id="c-metric">${optionsHTML(kv(ds.metrics), C.metric)}</select></div>
      <div class="field"><label>Chart type</label><select id="c-type">${optionsHTML([{ v: 'bar', l: 'Columns' }, { v: 'hbar', l: 'Bars (horizontal)' }, { v: 'line', l: 'Line' }, { v: 'donut', l: 'Donut' }], C.type)}</select></div>
      <div class="field"><label>Platform</label><select id="c-plat"><option value="">All</option>${optionsHTML(PLATFORMS, C.filters.platform)}</select></div>
      ${ds.bld ? `<div class="field"><label>Building</label><select id="c-bld"><option value="">All</option>${optionsHTML(buildingOptions(), C.filters.buildingId)}</select></div>` : ''}</div></div>
    <div class="card"><div class="card-h"><h3 id="c-title"></h3><span class="spacer"></span><button class="btn sm edit-only" id="c-pin">Pin to dashboard</button><button class="btn sm" id="c-png">Save PNG</button><button class="btn sm" id="c-csv">Export data</button></div><div id="c-out"></div></div>
    <div class="card"><div class="card-h"><h3>Data</h3></div><div id="c-tbl"></div></div>`;
    const draw = () => {
      const r = computeChart(C), title = `${r.metricLabel} by ${r.groupLabel.toLowerCase()}${C.split && C.type !== 'donut' ? ' and ' + (ds.groups[C.split]?.label || '').toLowerCase() : ''}`;
      $('#c-title').textContent = title; renderChart($('#c-out'), { ...r, type: C.type, title });
      $('#c-tbl').innerHTML = r.labels.length ? `<div class="tbl-wrap"><table><thead><tr><th>${esc(r.groupLabel)}</th>${r.series.map(s => `<th class="num">${esc(s.name)}</th>`).join('')}${r.series.length > 1 ? '<th class="num">Total</th>' : ''}</tr></thead><tbody>${r.labels.map((l, i) => `<tr><td>${esc(l)}</td>${r.series.map(s => `<td class="num">${r.money ? money(s.values[i]) : fmtNum(s.values[i])}</td>`).join('')}${r.series.length > 1 ? `<td class="num">${r.money ? money(sum(r.series, s => s.values[i])) : fmtNum(sum(r.series, s => s.values[i]))}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">No data.</div>';
      UI.chartResult = { r, title };
    };
    el.addEventListener('change', e => {
      const id = e.target.id, v = e.target.value;
      if (id === 'c-ds') { C.dataset = v; C.group = Object.keys(DS[v].groups)[0]; C.metric = Object.keys(DS[v].metrics)[0]; C.split = ''; C.filters = {}; return render(); }
      if (id === 'c-group') C.group = v; else if (id === 'c-split') C.split = v; else if (id === 'c-metric') C.metric = v; else if (id === 'c-type') C.type = v;
      else if (id === 'c-plat') C.filters.platform = v; else if (id === 'c-bld') C.filters.buildingId = v;
      draw();
    });
    el.addEventListener('click', e => {
      const p = e.target.closest('[data-preset]');
      if (p) { UI.chart = { topN: 12, filters: {}, split: '', ...clone(CHART_PRESETS[+p.dataset.preset].cfg) }; return render(); }
      if (e.target.closest('#c-png')) chartToPNG($('#c-out'), 'lab-chart');
      if (e.target.closest('#c-pin')) { DB.put('charts', { title: UI.chartResult.title, cfg: clone(C) }); toast('Pinned to the dashboard'); }
      if (e.target.closest('#c-csv')) { const { r } = UI.chartResult; download('chart-data.csv', toCSV([[r.groupLabel, ...r.series.map(s => s.name)], ...r.labels.map((l, i) => [l, ...r.series.map(s => s.values[i])])])); }
    });
    draw();
  }
};

// ================= IMPORT =================
const normH = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function autoMap(headers, defs) {
  const map = {}, byNorm = Object.fromEntries(headers.map(h => [normH(h), h]));
  defs.forEach(d => { const hit = d.alias.find(a => byNorm[a]); if (hit) map[d.k] = byNorm[hit]; });
  return map;
}
const mappingHTML = (headers, defs, map) => `<div class="form-grid">${defs.map(d => `<div class="field"><label>${esc(d.label)}${d.req ? ' *' : ''}</label><select data-map="${d.k}"><option value="">— not in file —</option>${optionsHTML(headers, map[d.k])}</select></div>`).join('')}</div>`;

const DEVICE_FIELDS = [
  { k: 'name', label: 'Device / station name', req: true, alias: ['devicename', 'name', 'computername', 'hostname', 'stationname', 'station', 'device', 'machinename'] },
  { k: 'serial', label: 'Serial number', alias: ['serialnumber', 'serial', 'serialno', 'deviceserial', 'serialnum'] },
  { k: 'model', label: 'Model', alias: ['model', 'devicemodel', 'productname', 'hardwaremodel', 'modelname'] },
  { k: 'manufacturer', label: 'Manufacturer', alias: ['manufacturer', 'make', 'vendor', 'brand'] },
  { k: 'os', label: 'Operating system', alias: ['os', 'operatingsystem', 'ostype', 'osname', 'platform'] },
  { k: 'osVersion', label: 'OS version', alias: ['osversion', 'operatingsystemversion', 'osbuild', 'version', 'buildnumber'] },
  { k: 'lastCheckIn', label: 'Last check-in / seen', alias: ['lastcheckin', 'lastcheckintime', 'lastsync', 'lastseen', 'lastcheckindate', 'lastcontact', 'lastbeat', 'lastconnection', 'lastactive', 'lastupdated', 'lastlogin'] },
  { k: 'user', label: 'Primary user', alias: ['primaryuserupn', 'primaryuser', 'user', 'username', 'userprincipalname', 'assigneduser', 'useremail', 'lastuser'] },
  { k: 'ram', label: 'RAM', alias: ['ram', 'physicalmemory', 'totalmemory', 'memory', 'memorygb', 'physicalmemorygb', 'installedmemory'] },
  { k: 'storage', label: 'Storage', alias: ['totalstorage', 'storage', 'storagespace', 'totalstoragegb', 'disksize', 'storagecapacity', 'totaldisk'] },
  { k: 'location', label: 'Location / room', alias: ['location', 'room', 'devicelocation', 'assetlocation', 'site', 'building'] },
  { k: 'tags', label: 'Group / tags (used to find the lab)', alias: ['tags', 'group', 'groupname', 'devicegroup', 'groups', 'devicegroups', 'stationgroup', 'lab', 'labname', 'category', 'department'] }
];
const USAGE_FIELDS = [
  { k: 'group', label: 'Lab / group name', req: true, alias: ['group', 'groupname', 'lab', 'labname', 'location', 'locationname', 'name', 'stationgroup'] },
  { k: 'hours', label: 'Total usage hours', alias: ['totalhours', 'hours', 'usagehours', 'totalusage', 'inusehours', 'totalusagehours', 'hoursused'] },
  { k: 'sessions', label: 'Sessions / logins', alias: ['sessions', 'logins', 'totalsessions', 'logincount', 'totallogins'] },
  { k: 'util', label: 'Utilization %', alias: ['utilization', 'utilizationpercent', 'avgutilization', 'percentutilization', 'utilizationrate', 'averageutilization', 'util', 'avgutilizationpercent'] }
];
const dropHTML = hint => `<div class="drop" id="drop"><p><b>Drop a CSV file here</b> or <label style="color:var(--accent);cursor:pointer;text-decoration:underline">choose a file<input type="file" id="file" accept=".csv,.txt,.tsv" hidden></label></p><p class="small">${hint}</p></div>`;
function bindDrop(host, onText) {
  const drop = $('#drop', host), inp = $('#file', host);
  const go = async f => { if (f) onText(await readFileText(f), f.name); };
  inp.onchange = () => go(inp.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); go(e.dataTransfer.files[0]); };
}

VIEWS.import = {
  render(el) {
    const tab = UI.impTab || 'devices';
    el.innerHTML = pageHead('Import') + `<div class="tabs"><a data-tab="devices" class="${tab === 'devices' ? 'on' : ''}">Intune · Mosyle · LabStats devices</a><a data-tab="usage" class="${tab === 'usage' ? 'on' : ''}">LabStats usage</a><a data-tab="inventory" class="${tab === 'inventory' ? 'on' : ''}">Old tracker / Microsoft Lists</a><a data-tab="labs" class="${tab === 'labs' ? 'on' : ''}">Lab list</a><a data-tab="warranty" class="${tab === 'warranty' ? 'on' : ''}">Warranty dates</a><a data-tab="apps" class="${tab === 'apps' ? 'on' : ''}">Installed apps</a></div><div id="imp"></div>`;
    el.onclick = e => { const t = e.target.closest('[data-tab]'); if (t) { UI.impTab = t.dataset.tab; render(); } };
    ({ devices: deviceImport, usage: usageImport, inventory: inventoryImport, labs: labListImport, warranty: warrantyImport, apps: appsImport })[tab]($('#imp', el));
  }
};

// ---- devices ----
function parseGB(s) {
  const n = num(s); if (!n) return 0;
  if (/tb/i.test(s)) return Math.round(n * 1000); if (/mb/i.test(s)) return Math.round(n / 1024);
  if (n > 1e7) return Math.round(n / 1e9);       // bytes
  return Math.round(n);
}
function parseDevices(I) {
  const { parsed, map, source } = I;
  return parsed.rows.map(r => {
    const g = k => map[k] ? (r[map[k]] || '').trim() : '', osRaw = g('os'), ver = g('osVersion'), model = g('model');
    const platform = platformFrom(osRaw, ver, source, model);
    return {
      name: g('name'), serial: g('serial'), model, manufacturer: g('manufacturer'), platform, os: friendlyOS(osRaw || (platform === 'Windows' ? 'Windows' : platform === 'Mac' ? 'macOS' : ''), ver),
      osVersion: ver, ramGB: parseGB(g('ram')), storageGB: parseGB(g('storage')), lastCheckIn: normDate(g('lastCheckIn')), user: g('user'), location: g('location'), tags: g('tags'), source, mobile: /ios|ipados|android|tvos|iphone|ipad/i.test(osRaw + ' ' + model)
    };
  }).filter(d => d.name || d.serial);
}
function buildDevicePreview(I) {
  const rows = parseDevices(I).filter(d => !(I.opts.skipMobile && d.mobile));
  const matcher = buildLabMatcher(), src = I.source;
  const bySerial = new Map(), byName = new Map(), byNameSrc = new Map();
  DB.data.devices.forEach(d => { if (d.serial) bySerial.set(d.serial.toUpperCase(), d); if (d.name) { byName.set(d.name.toLowerCase(), d); byNameSrc.set((d.source || '') + '|' + d.name.toLowerCase(), d); } });
  const items = rows.map(d => {
    const nm = (d.name || '').toLowerCase();
    const ex = (d.serial && bySerial.get(d.serial.toUpperCase())) || (src === 'LabStats' ? byName.get(nm) : byNameSrc.get(src + '|' + nm)) || null;
    const { lab, how } = matcher.full(d);
    const labId = ex && ex.labLocked && I.opts.keep ? ex.labId : (lab?.id || ex?.labId || '');
    let action = 'new';
    if (ex) action = ['name', 'model', 'os', 'osVersion', 'lastCheckIn', 'user'].some(k => d[k] && d[k] !== ex[k]) || labId !== (ex.labId || '') ? 'update' : 'same';
    return { d, ex, labId, action, how: lab && labId === lab.id ? how : '' };
  });
  return items;
}
function unmatchedPanel(items, I) {
  const groups = new Map();
  items.filter(i => !i.labId).forEach(i => {
    const key = (I.source === 'LabStats' && i.d.tags) ? i.d.tags : namePrefix(i.d.name) || i.d.name;
    const g = groups.get(key) || { key, n: 0, ex: [] }; g.n++; if (g.ex.length < 3) g.ex.push(i.d.name); groups.set(key, g);
  });
  if (!groups.size) return '';
  const list = [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 40);
  return `<div class="card" style="background:var(--surface2)"><h3>Link unrecognised name groups to labs</h3>
  <p class="small muted">These devices share a naming prefix but didn’t match any lab. Pick the lab for each group; the prefix is saved as a match keyword on that lab, so this import and every future one links them automatically.</p>
  <table><thead><tr><th>Name group</th><th class="num">Devices</th><th>Examples</th><th>Lab</th></tr></thead><tbody>${list.map(g => `<tr><td><b>${esc(g.key)}</b></td><td class="num">${g.n}</td><td class="small muted">${esc(g.ex.join(', '))}</td><td><select data-grp="${esc(g.key)}"><option value="">— leave unassigned —</option>${optionsHTML(labOptions())}</select></td></tr>`).join('')}</tbody></table>
  <p><button class="btn primary edit-only" id="savemap">Save mappings &amp; re-check</button></p></div>`;
}
function deviceImport(host) {
  const I = UI.impDev ??= { source: 'Intune', opts: { keep: true, missing: false, skipMobile: true } };
  const draw = () => {
    const items = I.parsed ? buildDevicePreview(I) : [], n = a => items.filter(i => i.action === a).length;
    host.innerHTML = `<div class="card"><div class="toolbar"><div class="field"><label>Where did this export come from?</label><select id="src">${optionsHTML(['Intune', 'Mosyle', 'LabStats'], I.source)}</select></div></div>
      <p class="small muted">${{
        Intune: 'Intune admin center → Devices → All devices → Export (CSV). Windows devices are matched by serial number.',
        Mosyle: 'Mosyle Manager → Management → Devices → export the device list as CSV. Mac / iPad devices are matched by serial number.',
        LabStats: 'LabStats → Stations (or a group’s station list) → export CSV. Adds station group / last-seen info and links stations to labs; devices already known from Intune / Mosyle are matched by name instead of duplicated.'
      }[I.source]}</p>
      ${dropHTML('Files are read in your browser only – nothing is uploaded anywhere.')}
      ${I.parsed ? `<h3 style="margin-top:16px">${esc(I.fileName)} – ${I.parsed.rows.length} rows</h3>${mappingHTML(I.parsed.headers, DEVICE_FIELDS, I.map)}
      <div style="margin:12px 0"><label class="chk"><input type="checkbox" data-opt="keep"${I.opts.keep ? ' checked' : ''}> Keep rooms I assigned by hand</label>
      <label class="chk"><input type="checkbox" data-opt="skipMobile"${I.opts.skipMobile ? ' checked' : ''}> Skip phones and tablets (iOS / iPadOS / Android)</label>
      <label class="chk"><input type="checkbox" data-opt="missing"${I.opts.missing ? ' checked' : ''}> Flag ${esc(I.source)} devices that are <i>not</i> in this file</label></div>
      <div class="chips" style="margin-bottom:10px"><span class="badge ok">${n('new')} new</span><span class="badge info">${n('update')} to update</span><span class="badge">${n('same')} unchanged</span><span class="badge ${items.some(i => !i.labId) ? 'warn' : ''}">${items.filter(i => !i.labId).length} without a lab</span></div>
      ${unmatchedPanel(items, I)}
      <div class="tbl-wrap" style="max-height:300px"><table><thead><tr><th>Name</th><th>Serial</th><th>Model</th><th>OS</th><th>Lab</th><th>Linked by</th><th>Action</th></tr></thead><tbody>${items.slice(0, 80).map(i => `<tr><td>${esc(i.d.name)}</td><td>${esc(i.d.serial)}</td><td>${esc(i.d.model)}</td><td>${esc(i.d.os)}</td><td>${i.labId ? esc(labLabel(DB.get('labs', i.labId))) : '<span class="badge warn">unassigned</span>'}</td><td class="small muted">${esc(i.how)}</td><td>${i.action}</td></tr>`).join('')}</tbody></table></div>
      ${items.length > 80 ? `<p class="small muted">Showing the first 80 of ${items.length}.</p>` : ''}
      <p><button class="btn primary edit-only" id="apply"${items.length ? '' : ' disabled'}>Import ${items.length} devices</button></p>` : ''}</div>`;
    bindDrop(host, (text, name) => { I.parsed = csvToObjects(text); I.fileName = name; I.map = autoMap(I.parsed.headers, DEVICE_FIELDS); if (!I.map.name && !I.map.serial) toast('Couldn’t recognise the columns – check the mapping below.', 'err'); draw(); });
    $('#src', host).onchange = e => { I.source = e.target.value; if (I.parsed) I.map = autoMap(I.parsed.headers, DEVICE_FIELDS); draw(); };
    host.onchange = e => {
      if (e.target.dataset.map !== undefined) { I.map[e.target.dataset.map] = e.target.value; draw(); }
      if (e.target.dataset.opt) { I.opts[e.target.dataset.opt] = e.target.checked; draw(); }
    };
    const sv = $('#savemap', host);
    if (sv) sv.onclick = () => {
      let n = 0;
      $$('[data-grp]', host).forEach(sel => {
        if (!sel.value) return; const lab = DB.get('labs', sel.value), key = sel.dataset.grp;
        const kws = new Set((lab.match || '').split(',').map(x => x.trim()).filter(Boolean)); kws.add(key);
        DB.put('labs', { ...lab, match: [...kws].join(', ') }); n++;
      });
      if (n) { DB.log(`Linked ${n} device-name groups to labs during import`); toast(`Saved ${n} name→lab mappings (kept as match keywords)`); }
      draw();
    };
    const ap = $('#apply', host); if (ap) ap.onclick = () => applyDeviceImport(I, items, draw);
  };
  draw();
}
function applyDeviceImport(I, items, redraw, quiet) {
  const src = I.source, seen = new Set(), t = todayStr(); let nNew = 0, nUp = 0;
  const lineWarranty = new Map(); DB.data.hardware.forEach(l => { if (l.warrantyEnd) lineWarranty.set(l.labId + '|' + modelName(l).toLowerCase(), l.warrantyEnd); });
  items.forEach(({ d, ex, labId, action }) => {
    if (ex) seen.add(ex.id);
    if (action === 'same') return;
    if (src !== 'LabStats' && d.model) findOrCreateModel(d.model, d.platform, d.manufacturer);
    let patch;
    if (src === 'LabStats' && ex) {
      patch = { labId, group: d.tags || ex.group, lsSeen: d.lastCheckIn || ex.lsSeen };
      if (d.lastCheckIn && (!ex.lastCheckIn || d.lastCheckIn > ex.lastCheckIn)) patch.lastCheckIn = d.lastCheckIn;
    } else {
      patch = { name: d.name, serial: d.serial, model: d.model, manufacturer: d.manufacturer, platform: d.platform, os: d.os, osVersion: d.osVersion, ramGB: d.ramGB || '', storageGB: d.storageGB || '', lastCheckIn: d.lastCheckIn, user: d.user, location: d.location, tags: d.tags, labId, missing: false, lastImport: t };
      Object.keys(patch).forEach(k => { if (patch[k] === '' && ex && ex[k]) delete patch[k]; });
      if (!ex) patch.source = src;
      if (!(ex && ex.warrantyEnd)) { const w = lineWarranty.get(labId + '|' + (d.model || '').toLowerCase()); if (w) Object.assign(patch, { warrantyEnd: w, warrantySource: 'Old tracker', warrantyChecked: t }); }
    }
    DB.put('devices', { ...(ex || {}), ...patch }); ex ? nUp++ : nNew++;
  });
  let miss = 0;
  if (I.opts.missing) DB.data.devices.filter(x => x.source === src && !seen.has(x.id) && !x.missing).forEach(x => { DB.put('devices', { ...x, missing: true }); miss++; });
  DB.log(`Imported ${src} devices from ${I.fileName}: ${nNew} new, ${nUp} updated${miss ? `, ${miss} flagged missing` : ''}`);
  toast(`${src}: ${nNew} new, ${nUp} updated${miss ? `, ${miss} flagged missing` : ''}`);
  if (!quiet) { UI.impDev = { source: src, opts: I.opts }; location.hash = '#/devices'; }
  return `${nNew} new, ${nUp} updated${miss ? `, ${miss} flagged missing` : ''}`;
}

// ---- LabStats usage ----
function usageImport(host) {
  const I = UI.impUsage ??= { period: 'Last 90 days', avail: '' };
  const preview = () => buildUsageRows(I.parsed, I.map, I.avail);
  const draw = () => {
    const rows = I.parsed ? preview() : [];
    host.innerHTML = `<div class="card"><p class="small muted">LabStats → Reports → export a usage / utilization report by <b>group</b> (or lab) as CSV for the period you want. Each group is matched to a lab using the lab’s <b>match keywords</b> (or building + room in the name). Results show on the Labs page, the lab’s page, the replacement plan and in Charts – handy for spotting labs that are over-sized before you spend on replacements.</p>
    <div class="toolbar"><div class="field"><label>Report period (for your reference)</label><input id="period" value="${esc(I.period)}"></div>
    <div class="field"><label>Open hours available per seat (optional)</label><input type="number" id="avail" value="${esc(I.avail)}" placeholder="e.g. 600"></div></div>
    <p class="small muted">Only needed when the report has hours but no utilization %: utilization = hours ÷ (seats × available hours per seat).</p>
    ${dropHTML('Export: group / lab name, hours, sessions and (ideally) utilization %.')}
    ${I.parsed ? `<h3 style="margin-top:16px">${esc(I.fileName)} – ${rows.length} groups</h3>${mappingHTML(I.parsed.headers, USAGE_FIELDS, I.map)}
    <div class="chips" style="margin:10px 0"><span class="badge ok">${rows.filter(r => r.lab).length} matched to a lab</span><span class="badge ${rows.some(r => !r.lab) ? 'warn' : ''}">${rows.filter(r => !r.lab).length} not matched</span></div>
    <div class="tbl-wrap" style="max-height:300px"><table><thead><tr><th>LabStats group</th><th>Lab</th><th class="num">Hours</th><th class="num">Sessions</th><th class="num">Utilization</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.group)}</td><td>${r.lab ? esc(labLabel(r.lab)) : '<span class="badge warn">no match – add a keyword to the lab</span>'}</td><td class="num">${r.hours != null ? fmtNum(r.hours) : '—'}</td><td class="num">${r.sessions != null ? fmtNum(r.sessions) : '—'}</td><td class="num">${r.util != null ? pct(r.util) : '—'}</td></tr>`).join('')}</tbody></table></div>
    <p><button class="btn primary edit-only" id="apply"${rows.some(r => r.lab) ? '' : ' disabled'}>Save usage to ${rows.filter(r => r.lab).length} labs</button></p>` : ''}</div>`;
    bindDrop(host, (text, name) => { I.parsed = csvToObjects(text); I.fileName = name; I.map = autoMap(I.parsed.headers, USAGE_FIELDS); draw(); });
    $('#period', host).onchange = e => { I.period = e.target.value; };
    $('#avail', host).onchange = e => { I.avail = e.target.value; if (I.parsed) draw(); };
    host.onchange = e => { if (e.target.dataset.map !== undefined) { I.map[e.target.dataset.map] = e.target.value; draw(); } };
    const ap = $('#apply', host);
    if (ap) ap.onclick = () => {
      const n = applyUsageRows(preview(), I.period);
      DB.log(`Imported LabStats usage for ${n} labs (${I.period})`); toast(`Saved LabStats usage for ${n} labs`); location.hash = '#/labs';
    };
  };
  draw();
}

// ================= SETTINGS =================
VIEWS.settings = {
  render(el) {
    const s = S(), st = DB.store;
    el.innerHTML = pageHead('Settings & data') + '<div id="ds-slot"></div>' + appearanceCardHTML() + `
    <div class="grid g2"><div class="card"><div class="card-h"><h3>Planning rules</h3></div><form id="f" class="form-grid">
      ${fieldHTML({ k: 'orgName', label: 'Organization name' }, s.orgName)}${fieldHTML({ k: 'fyStartMonth', label: 'Fiscal year starts', type: 'select', req: true, options: Array.from({ length: 12 }, (_, i) => ({ v: i + 1, l: new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' }) })) }, s.fyStartMonth)}
      ${PLATFORMS.map(p => fieldHTML({ k: 'lc_' + p, label: `Default lifecycle – ${p} (yrs)`, type: 'number', min: 1, step: '0.5' }, s.lifecycle[p])).join('')}
      ${fieldHTML({ k: 'warnMonths', label: '“Due soon” window (months)', type: 'number', min: 1 }, s.warnMonths)}${fieldHTML({ k: 'staleDays', label: 'Device stale after (days)', type: 'number', min: 1 }, s.staleDays)}
      ${fieldHTML({ k: 'licenseWarnDays', label: 'License warning (days)', type: 'number', min: 1 }, s.licenseWarnDays)}${fieldHTML({ k: 'lowUtilPct', label: 'Low LabStats utilization below (%)', type: 'number', min: 1 }, s.lowUtilPct)}
      ${fieldHTML({ k: 'currency', label: 'Currency code', help: 'e.g. USD, CAD, GBP' }, s.currency)}${fieldHTML({ k: 'assetTagPrefix', label: 'Asset tag prefix', help: 'Used by “Generate asset tags”' }, s.assetTagPrefix)}
      ${fieldHTML({ k: 'osSupport', label: 'OS support end dates (one per line: name | YYYY-MM-DD)', type: 'textarea', wide: true, rows: 3, help: 'Matched against each device’s OS, e.g. “Windows 10 | 2025-10-14” or “macOS Ventura | 2026-09-01”.' }, osRulesText())}
      ${fieldHTML({ k: 'targetUtil', label: 'Target utilization for right-sizing (%)', type: 'number', min: 10 }, s.targetUtil)}
      ${fieldHTML({ k: 'blackouts', label: 'Install blackout windows (one per line: name | start | end)', type: 'textarea', wide: true, rows: 3, help: 'e.g. Fall finals | 2026-12-10 | 2026-12-20. Projects whose install dates overlap are flagged.' }, blackoutText())}
      ${fieldHTML({ k: 'fundingSources', label: 'Funding sources (one per line)', type: 'textarea', wide: true, rows: 4, help: 'Shown when recording how hardware was purchased and how its replacement will be funded.' }, (s.fundingSources || []).join('\n'))}
      <div class="field wide"><button class="btn primary edit-only" type="submit">Save settings</button></div></form></div>
    <div class="card"><div class="card-h"><h3>Data &amp; sharing</h3></div>
      <p class="small">Storage: <b>${esc(st.kind === 'folder' ? 'Shared folder “' + st.name + '”' : st.kind === 'demo' ? 'Demo data in this browser' : 'Local file (manual)')}</b><br>Version ${DB.rev} · last saved ${DB.lastSaved ? new Date(DB.lastSaved).toLocaleString() : '—'}${DB.lastBy ? ' by ' + esc(DB.lastBy) : ''}<br>You are <b>${esc(DB.user)}</b>.</p>
      <p class="small muted">The folder you picked holds <code>${DATA_FILE}</code> and a <code>backups/</code> folder (one snapshot per day, last 60 kept). Edits from several people are merged field-by-field and the page checks for others’ changes every 15 seconds.</p>
      <div class="chips"><button class="btn" id="bk">Download backup</button><label class="btn edit-only">Restore from backup…<input type="file" id="rs" accept=".json" hidden></label><button class="btn" id="chg">Change folder / user</button></div></div></div>
    ${autoImportCardHTML()}${lenovoCardHTML()}${appleCardHTML()}
    <div class="card"><div class="card-h"><h3>Replacement notice email</h3></div>
      <p class="small muted">Default wording for “Email contacts”. Placeholders: <code>{name}</code> <code>{lab}</code> <code>{date}</code> <code>{deadline}</code> <code>{sender}</code>. The device and application tables are added automatically.</p>
      <div class="form-grid"><div class="field wide"><label>Subject</label><input id="et-sub" value="${esc(emailTpl().subject)}"></div><div class="field wide"><label>Opening</label><textarea id="et-intro" rows="7">${esc(emailTpl().intro)}</textarea></div><div class="field wide"><label>Closing</label><textarea id="et-outro" rows="2">${esc(emailTpl().outro)}</textarea></div>
      <div class="field wide"><button class="btn primary edit-only" id="et-save">Save email template</button></div></div></div>
    <div class="card"><div class="card-h"><h3>Device naming convention</h3></div>
      <p class="small muted">Tell the tracker how your devices are named so Intune, Mosyle and LabStats devices land in the right room. Without any setup it already looks for building code + room (e.g. <code>SMI204-PC01</code>, <code>SMI-204-MAC03</code>), plus each lab’s match keywords and each building’s aliases. Add patterns for anything else, one per line, using <code>{bldg}</code> <code>{room}</code> <code>{n}</code> (digits) <code>{type}</code> (letters) <code>{any}</code>.</p>
      <div class="form-grid"><div class="field wide"><label>Name patterns (one per line)</label><textarea id="pats" rows="4" placeholder="{bldg}-{room}-{type}{n}&#10;{bldg}{room}{type}{n}&#10;LAB-{bldg}-{room}-{any}">${esc((s.namePatterns || []).join('\n'))}</textarea></div>
      <div class="field"><label>Test a device name</label><input id="tname" placeholder="e.g. SMI-204-PC07"></div><div class="field"><label>Result</label><div id="tres" class="small" style="padding:8px 0">—</div></div>
      <div class="field wide"><button class="btn primary edit-only" id="savepats">Save patterns</button></div></div></div>
    <div class="card"><div class="card-h"><h3>Recent activity</h3></div><div class="tbl-wrap" style="max-height:340px"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${DB.data.audit.slice(-120).reverse().map(a => `<tr><td class="nowrap">${new Date(a.t).toLocaleString()}</td><td>${esc(a.u)}</td><td class="small">${esc([...(a.n || []), ...(a.c || [])].join(' · '))}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No activity yet.</td></tr>'}</tbody></table></div></div>`;
    $('#f').onsubmit = e => {
      e.preventDefault();
      const f = e.target, v = k => f.elements[k].value.trim();
      DB.setSetting('orgName', v('orgName')); DB.setSetting('fyStartMonth', +v('fyStartMonth'));
      DB.setSetting('lifecycle', Object.fromEntries(PLATFORMS.map(p => [p, num(v('lc_' + p)) || 5])));
      ['warnMonths', 'staleDays', 'licenseWarnDays', 'lowUtilPct'].forEach(k => DB.setSetting(k, num(v(k)) || s[k]));
      DB.setSetting('currency', (v('currency') || 'USD').toUpperCase()); DB.setSetting('assetTagPrefix', v('assetTagPrefix') || 'LAB-'); DB.setSetting('osSupport', parseOsRules(v('osSupport'))); DB.setSetting('blackouts', parseBlackouts(v('blackouts'))); DB.setSetting('targetUtil', num(v('targetUtil')) || 70); DB.setSetting('fundingSources', v('fundingSources').split('\n').map(x => x.trim()).filter(Boolean)); DB.log('Changed settings'); toast('Settings saved'); render();
    };
    dataSafetyCardHTML().then(h => { const slot = $('#ds-slot', el); if (slot) { slot.innerHTML = h; bindDataSafetyCard(slot); } });
    bindAppearanceCard(el); bindAutoImportCard(el); bindLenovoCard(el); bindAppleCard(el);
    $('#et-save').onclick = () => { DB.setSetting('emailTemplate', { subject: $('#et-sub').value, intro: $('#et-intro').value, outro: $('#et-outro').value }); DB.log('Changed email template'); toast('Email template saved'); };
    const test = () => { const r = buildLabMatcher().full({ name: $('#tname').value }); $('#tres').innerHTML = $('#tname').value ? (r.lab ? `→ <b>${esc(labLabel(r.lab))}</b> <span class="muted">(${r.how})</span>` : '<span class="badge warn">no lab matched</span>') : '—'; };
    $('#tname').oninput = test;
    $('#savepats').onclick = () => { DB.setSetting('namePatterns', $('#pats').value.split('\n').map(x => x.trim()).filter(Boolean)); DB.log('Changed naming patterns'); toast('Patterns saved'); test(); };
    $('#bk').onclick = () => download(`lab-tracker-backup-${todayStr()}.json`, JSON.stringify(DB.data), 'application/json');
    $('#chg').onclick = () => showConnect({ changing: true });
    $('#rs').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const d = JSON.parse(await readFileText(f)); if (!d.labs || !d.hardware) throw new Error('This does not look like a tracker backup.');
        if (!confirm(`Replace ALL current data with the backup “${f.name}” (saved ${d.savedAt || 'unknown'})? Download a backup of the current data first if you are unsure.`)) return;
        await DB.replaceAll(d); toast('Backup restored'); render();
      } catch (err) { toast('Restore failed: ' + err.message, 'err'); }
    };
  }
};
