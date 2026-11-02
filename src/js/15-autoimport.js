// Drop-folder auto-import: scripts write CSV exports into <data folder>/imports; the tracker offers (or automatically runs) the import.
const AUTO_FILES = {
  'intune-devices.csv': { label: 'Intune devices', kind: 'devices', source: 'Intune' }, 'mosyle-devices.csv': { label: 'Mosyle devices', kind: 'devices', source: 'Mosyle' },
  'labstats-stations.csv': { label: 'LabStats stations', kind: 'devices', source: 'LabStats' }, 'labstats-usage.csv': { label: 'LabStats usage', kind: 'usage' },
  'warranty.csv': { label: 'Warranty dates', kind: 'warranty' }, 'lenovo-warranty.csv': { label: 'Lenovo warranty dates', kind: 'warranty' }, 'installed-apps.csv': { label: 'Installed apps', kind: 'apps' }
};
// ---- shared builders (used by the Import pages and by auto-import) ----
function buildUsageRows(parsed, map, avail) {
  const matcher = buildLabMatcher();
  return parsed.rows.map(r => {
    const g = k => map[k] ? (r[map[k]] || '').trim() : '', lab = matcher({ name: g('group'), tags: g('group') });
    let util = g('util') ? num(g('util')) : null; const hours = g('hours') ? num(g('hours')) : null;
    if (util != null && util <= 1 && /\./.test(g('util')) && !/%/.test(g('util'))) util = util * 100;
    if (util == null && hours != null && lab && lab.seats && num(avail) > 0) util = Math.min(100, Math.round(hours / (lab.seats * num(avail)) * 1000) / 10);
    return { group: g('group'), lab, hours, sessions: g('sessions') ? num(g('sessions')) : null, util };
  }).filter(x => x.group);
}
function applyUsageRows(rows, period) {
  const agg = new Map();
  rows.filter(r => r.lab).forEach(r => { const a = agg.get(r.lab.id) || { lab: r.lab, hours: 0, sessions: 0, utils: [] }; a.hours += r.hours || 0; a.sessions += r.sessions || 0; if (r.util != null) a.utils.push(r.util); agg.set(r.lab.id, a); });
  agg.forEach(a => {
    const util = a.utils.length ? Math.round(sum(a.utils) / a.utils.length * 10) / 10 : null, snap = { hours: a.hours, sessions: a.sessions, util, period, importedAt: todayStr() };
    const hist = [...(a.lab.usageHistory || []).filter(h => h.period !== period), snap].slice(-24);
    DB.put('labs', { ...a.lab, usage: snap, usageHistory: hist });
  });
  return agg.size;
}
function buildWarrantyRows(parsed, map) {
  const bySerial = new Map(DB.data.devices.filter(d => d.serial).map(d => [d.serial.trim().toUpperCase(), d])), agg = new Map();
  parsed.rows.forEach(r => {
    const g = k => map[k] ? (r[map[k]] || '').trim() : '', serial = g('serial').toUpperCase(); if (!serial) return;
    const end = warDate(g('end')), start = warDate(g('start')), a = agg.get(serial) || { serial, end: '', start: '', product: '' };
    if (end && end > a.end) { a.end = end; a.product = g('product') || a.product; }
    if (start && (!a.start || start < a.start)) a.start = start;
    agg.set(serial, a);
  });
  return [...agg.values()].map(a => ({ ...a, d: bySerial.get(a.serial) }));
}

// ---- folder watching ----
const importCfg = () => Object.assign({ mode: 'ask', seen: {} }, S().autoImport || {});
function applyAutoFile(def, name, text) {
  if (def.kind === 'devices') {
    const I = { source: def.source, parsed: csvToObjects(text), fileName: name, opts: { keep: true, skipMobile: true, missing: false } };
    const known = DB.data.devices.filter(d => d.source === def.source).length;
    I.opts.missing = def.source !== 'LabStats' && I.parsed.rows.length >= Math.max(1, known * 0.5);    // only flag "missing" when the file looks like a full export
    I.map = autoMap(I.parsed.headers, DEVICE_FIELDS);
    return applyDeviceImport(I, buildDevicePreview(I), null, true);
  }
  if (def.kind === 'usage') { const parsed = csvToObjects(text), map = autoMap(parsed.headers, USAGE_FIELDS); return `${applyUsageRows(buildUsageRows(parsed, map, ''), 'Auto import ' + todayStr())} labs updated`; }
  if (def.kind === 'warranty') {
    const parsed = tableFromRows(parseCSV(text)), map = autoMap(parsed.headers, WARRANTY_FIELDS);
    if (!map.end) { const h = parsed.headers.find(x => /end|expir/i.test(x)); if (h) map.end = h; }
    const ok = buildWarrantyRows(parsed, map).filter(r => r.d && r.end); ok.forEach(r => saveWarranty(r.d, r, 'Auto import')); return `${ok.length} devices updated`;
  }
  if (def.kind === 'apps') return applyInstalledApps(parseCSV(text), name);
  throw new Error('Unknown file type');
}
function markSeen(list) { const cfg = importCfg(), seen = { ...cfg.seen }; list.forEach(p => seen[p.key] = p.stamp); DB.setSetting('autoImport', { ...cfg, seen }); }
async function checkImportFolder() {
  const st = DB.store; if (!st || st.kind !== 'folder' || !st.listImports) return;
  const cfg = importCfg(); if (cfg.mode === 'off') { UI.pendingImports = []; return renderImportBanner(); }
  const files = await st.listImports();
  UI.pendingImports = files.map(f => ({ ...f, key: f.name.toLowerCase(), def: AUTO_FILES[f.name.toLowerCase()] })).filter(p => p.def && cfg.seen[p.key] !== p.stamp);
  if (UI.pendingImports.length && cfg.mode === 'auto' && !DB.readOnly) await runPendingImports(UI.pendingImports); else renderImportBanner();
}
async function runPendingImports(list) {
  const msgs = [];
  for (const p of list) {
    try { const res = applyAutoFile(p.def, p.name, await readFileText(p.file)); msgs.push(`${p.def.label}: ${res}`); DB.log(`Auto-imported ${p.name}: ${res}`); }
    catch (e) { console.error(e); toast(`Import of ${p.name} failed: ${e.message}`, 'err'); }
  }
  markSeen(list); UI.pendingImports = []; renderImportBanner();
  if (msgs.length) { toast(msgs.join(' · ')); render(); }
}
function renderImportBanner() {
  const el = $('#imp-banner'); if (!el) return; const list = UI.pendingImports || [];
  if (!list.length || DB.readOnly) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="banner"><b>${ic('upload')} New exports found in the imports folder</b>
    <span class="chips">${list.map(p => `<span class="pill">${esc(p.def.label)} <span class="muted small">${ageText(p.modified)}</span></span>`).join('')}</span>
    <span class="spacer"></span><button class="btn sm primary" data-impact="now">Import now</button>${list.some(p => p.def.kind !== 'apps') ? '<button class="btn sm" data-impact="review">Review first</button>' : ''}<button class="btn sm ghost" data-impact="ignore">Ignore</button></div>`;
}
const ageText = ms => { const h = (Date.now() - ms) / 36e5; return h < 1 ? 'just now' : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-impact]'); if (!b) return; const list = UI.pendingImports || [];
  if (b.dataset.impact === 'now') await runPendingImports(list);
  else if (b.dataset.impact === 'ignore') { markSeen(list); UI.pendingImports = []; renderImportBanner(); }
  else if (b.dataset.impact === 'review') {
    const p = list.find(x => x.def.kind !== 'apps'); if (!p) return; const text = await readFileText(p.file);
    if (p.def.kind === 'devices') { const I = { source: p.def.source, opts: { keep: true, skipMobile: true, missing: p.def.source !== 'LabStats' }, parsed: csvToObjects(text), fileName: p.name }; I.map = autoMap(I.parsed.headers, DEVICE_FIELDS); UI.impDev = I; UI.impTab = 'devices'; }
    else if (p.def.kind === 'usage') { const I = { period: 'Auto import ' + todayStr(), avail: '', parsed: csvToObjects(text), fileName: p.name }; I.map = autoMap(I.parsed.headers, USAGE_FIELDS); UI.impUsage = I; UI.impTab = 'usage'; }
    else { const I = {}; I.parsed = tableFromRows(parseCSV(text)); I.fileName = p.name; I.map = autoMap(I.parsed.headers, WARRANTY_FIELDS); UI.impWar = I; UI.impTab = 'warranty'; }
    markSeen([p]); UI.pendingImports = list.filter(x => x !== p); renderImportBanner(); location.hash = '#/import'; render();
  }
});

// ---- Settings card ----
const autoImportCardHTML = () => { const c = importCfg(); return `<div class="card"><div class="card-h"><h3>Automatic imports (drop folder)</h3></div>
  <p class="small muted">Run the scripts in <code>tools/</code> on a schedule (for example a nightly Task Scheduler job) and have them write CSV exports into the <code>imports</code> folder inside your data folder. When someone opens the tracker it notices new or changed files and offers to import them (or imports them automatically). Expected file names: ${Object.keys(AUTO_FILES).map(n => `<code>${n}</code>`).join(' ')}. Imports are safe to repeat: devices are matched by serial number.</p>
  <div class="toolbar"><div class="field"><label>When new files appear</label><select id="ai-mode">${optionsHTML([{ v: 'ask', l: 'Ask me (banner)' }, { v: 'auto', l: 'Import automatically' }, { v: 'off', l: 'Off' }], c.mode)}</select></div>
  <div class="field"><label>&nbsp;</label><span><button class="btn" id="ai-make" type="button">Create the imports folder</button> <button class="btn" id="ai-check" type="button">Check now</button> <button class="btn sm ghost" id="ai-reset" type="button" title="Treat all files as new">Forget what was imported</button></span></div></div></div>`; };
function bindAutoImportCard(root) {
  $('#ai-mode', root).onchange = e => { DB.setSetting('autoImport', { ...importCfg(), mode: e.target.value }); toast('Saved'); };
  $('#ai-make', root).onclick = async () => { try { if (DB.store.kind !== 'folder') throw new Error('Only available with a shared data folder.'); await DB.store.ensureImportsDir(); toast('imports folder is ready'); } catch (e) { toast(e.message, 'err'); } };
  $('#ai-check', root).onclick = async () => { await checkImportFolder(); toast((UI.pendingImports || []).length ? `${UI.pendingImports.length} file(s) waiting` : 'Nothing new'); };
  $('#ai-reset', root).onclick = () => { DB.setSetting('autoImport', { ...importCfg(), seen: {} }); toast('Will treat every file as new'); };
}
