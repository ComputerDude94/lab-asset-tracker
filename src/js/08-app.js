// Start-up: connect to the shared folder, then run.
const HAS_FSA = typeof window.showDirectoryPicker === 'function';

function showConnect(opts = {}) {
  $('#app').hidden = true; const c = $('#connect'); c.hidden = false;
  const saved = opts.saved, name = DB.user || localStorage.getItem('lt-user') || '';
  c.innerHTML = `<div class="box card">
    <h1>Lab Asset Tracker</h1>
    <p class="muted">${opts.changing ? 'Choose a different data folder or change who you are.' : 'Everyone on the team uses this same page and the same data folder on the network share.'}</p>
    <div class="field"><label>Your name (shown in the change history)</label><input id="who" value="${esc(name)}" placeholder="e.g. Jordan Smith"></div>
    <div style="display:grid;gap:10px;margin-top:16px">
      ${HAS_FSA ? `${saved ? `<button class="btn primary" id="re">Reconnect to “${esc(saved.name)}”</button>` : ''}
      <button class="btn ${saved ? '' : 'primary'}" id="pick">Choose the shared data folder…</button>
      <button class="btn" id="pickro">Open in view-only mode…</button>` : `<div class="badge warn" style="white-space:normal;padding:8px">This browser can’t read or write a shared folder. Use Microsoft Edge or Google Chrome for team editing; here you can still open a data file by hand.</div>`}
      <label class="btn">Open a data file manually…<input type="file" id="manual" accept=".json" hidden></label>
      <button class="btn" id="demo">Try it with sample data</button>
      ${opts.changing ? '<button class="btn" id="back">Cancel</button>' : ''}
    </div>
    <details style="margin-top:16px" class="small muted"><summary>First-time setup</summary><ol class="steps"><li>Put this HTML file in a folder on the network share (e.g. <code>\\\\server\\IT\\LabTracker</code>).</li><li>Open it in Edge or Chrome, enter your name, and choose that same folder.</li><li>If the folder has no data yet you’ll be asked to create it. The browser remembers the folder, so next time it’s one click.</li></ol></details></div>`;
  const who = () => { const v = $('#who').value.trim(); if (!v) { toast('Please enter your name first.', 'err'); $('#who').focus(); return null; } DB.user = v; localStorage.setItem('lt-user', v); return v; };
  const guard = fn => async () => { if (!who()) return; try { await fn(); } catch (e) { if (e.name !== 'AbortError') { console.error(e); toast(e.message, 'err'); } } };
  if ($('#re')) $('#re').onclick = guard(async () => { if (await saved.requestPermission({ mode: saved.ro ? 'read' : 'readwrite' }) !== 'granted') throw new Error('Permission was not granted.'); await connectFolder(saved, !!saved.ro); });
  if ($('#pick')) $('#pick').onclick = guard(async () => { const h = await showDirectoryPicker({ id: 'labtracker', mode: 'readwrite' }); await IDB.set('dir', h); await connectFolder(h, false); });
  if ($('#pickro')) $('#pickro').onclick = guard(async () => { const h = await showDirectoryPicker({ id: 'labtracker', mode: 'read' }); await connectFolder(h, true); });
  $('#demo').onclick = guard(async () => { await startStore(new MemStore('demo', 'Demo', 'labtracker-demo'), seedData); });
  $('#manual').onchange = guard(async e => { const f = $('#manual').files[0]; if (!f) return; const st = new MemStore('file', f.name, null); st.text = await readFileText(f); JSON.parse(st.text); await startStore(st); });
  if ($('#back')) $('#back').onclick = () => { $('#connect').hidden = true; $('#app').hidden = false; };
  if (!opts.changing && !name) $('#who').focus();
}

async function connectFolder(handle, readOnly) {
  if (readOnly) handle.ro = true;
  const store = new FolderStore(handle, readOnly);
  let disk = await store.read();
  if (!disk) {
    if (readOnly) throw new Error('No tracker data was found in that folder.');
    if (!confirm(`There is no tracker data in “${handle.name}” yet.\n\nCreate a new, empty tracker here? (Choose Cancel if you picked the wrong folder.)`)) return;
    const d = emptyData(); d.savedBy = DB.user; d.savedAt = new Date().toISOString(); d.saveId = uid();
    await store.write(JSON.stringify(d));
  }
  await startStore(store, null, readOnly);
}

async function startStore(store, seedFn, readOnly = false) {
  clearInterval(DB.pollTimer);
  DB.store = store; DB.readOnly = readOnly; DB.touched = {}; DB.baseRec = {}; DB.settingsTouched = {}; DB.notes = [];
  let disk;
  try { disk = await readChecked(store); }
  catch (e) {
    if (!e.damaged || store.kind !== 'folder' || readOnly) throw e;
    const bk = await store.listBackups();
    if (!bk.length) throw new Error('The data file is damaged (' + e.message + ') and no backups were found.');
    if (!confirm(`The shared data file is damaged:\n${e.message}\n\nRestore the most recent backup (${bk[0]})? The damaged file is kept next to it as lab-tracker-data.damaged-….json. Changes since that backup will be lost.`)) throw e;
    await store.keepDamaged(); await store.write(await store.readBackup(bk[0])); disk = await readChecked(store);
  }
  if (!disk && seedFn) { const d = seedFn(); d.savedAt = new Date().toISOString(); d.savedBy = 'Demo'; d.saveId = uid(); await store.write(JSON.stringify(d)); disk = await store.read(); }
  if (!disk) throw new Error('No data found.');
  DB.data = normalizeData(emptyData()); DB._idx = {};
  DB.adoptRemote(disk.data, disk.stamp);
  DB.storeRO = readOnly;
  $('#connect').hidden = true; $('#app').hidden = false;
  await identifyUser(); syncAutoProjects();
  DB.pollTimer = setInterval(() => DB.poll(), 15000);
  clearInterval(DB.impTimer); DB.impTimer = setInterval(() => checkImportFolder().catch(() => { }), 60000); setTimeout(() => checkImportFolder().catch(() => { }), 1500);
  if (!location.hash) location.hash = '#/dashboard';
  render();
}

$('#btn-user').onclick = () => identifyUser(true);
$('#btn-dl').onclick = () => { if (DB.store?.kind === 'file') { download(`lab-tracker-data.json`, JSON.stringify(DB.data), 'application/json'); DB.store.unsaved = false; updateStatus(); } };
window.addEventListener('beforeunload', e => { if (DB.dirty() || DB.saving || (DB.store?.kind === 'file' && DB.store.unsaved)) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && DB.store) DB.poll(); });


// ---------- app chrome: menus, search, create ----------
function initChrome() {
  $('#btn-menu').innerHTML = ic('menu', 20); $('#gs-ic').innerHTML = ic('search'); $('#plus-ic').innerHTML = ic('plus');
  $('#create-menu').innerHTML = `<div class="dh">Create new</div>` + [['lab', 'monitor', 'Lab'], ['hardware', 'cpu', 'Hardware line'], ['device', 'laptop', 'Device'], ['model', 'tag', 'Model'], ['software', 'package', 'Software'], ['contact', 'users', 'Contact'], ['maintenance', 'tool', 'Maintenance'], ['building', 'building', 'Building']]
    .map(([k, i, l]) => `<button data-create="${k}">${ic(i)} ${l}</button>`).join('');
  $('#btn-mode').onclick = cycleMode;
  $('#btn-menu').onclick = () => document.body.classList.toggle(innerWidth <= 900 ? 'nav-open' : 'nav-collapsed');
  document.addEventListener('click', e => {
    const t = e.target, dd = t.closest('.dd');
    $$('.dd.open').forEach(x => { if (x !== dd) x.classList.remove('open'); });
    if (t.closest('[data-dd]')) dd.classList.toggle('open');
    const c = t.closest('[data-create]'); if (c) { $('#create').classList.remove('open'); editEntity(c.dataset.create); }
    if (!t.closest('.gsearch')) $('#gs-res').hidden = true;
    const o = t.closest('[data-open]');
    if (o && o.dataset.open) { e.preventDefault(); const [tb, id] = o.dataset.open.split('|'); $('#gs-res').hidden = true; $('#gs').value = ''; editEntity(EDIT_KIND[tb], id); }
    else if (t.closest('.gs-res a')) { $('#gs-res').hidden = true; $('#gs').value = ''; }
    if (t.closest('#nav a')) document.body.classList.remove('nav-open');
  });
  $('#gs').addEventListener('input', e => runSearch(e.target.value));
  $('#gs').addEventListener('focus', e => runSearch(e.target.value));
  $('#gs').addEventListener('keydown', e => { if (e.key === 'Enter') { const a = $('#gs-res a'); if (a) a.click(); } if (e.key === 'Escape') { e.target.value = ''; $('#gs-res').hidden = true; e.target.blur(); } });
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !UI.modal) { e.preventDefault(); $('#gs').focus(); } });
}
initChrome();

(async function boot() {
  DB.user = localStorage.getItem('lt-user') || '';
  if (HAS_FSA) {
    const h = await IDB.get('dir');
    if (h && DB.user) {
      try { if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') { await connectFolder(h, false); return; } } catch (e) { console.warn(e); }
      return showConnect({ saved: h });
    }
  }
  showConnect({});
})();
