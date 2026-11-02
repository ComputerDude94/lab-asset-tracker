// Data layer: one JSON file in a shared folder, merged record-by-record so several people can edit at once.
const DATA_FILE = 'lab-tracker-data.json';
const LOCK_FILE = 'lab-tracker.lock';
const TABLES = ['buildings', 'labs', 'models', 'hardware', 'devices', 'software', 'labSoftware', 'contacts', 'charts', 'maintenances', 'proposals', 'projects', 'confirmations', 'baselines', 'audits'];
const DEFAULT_SETTINGS = { orgName: '', fyStartMonth: 7, lifecycle: { Windows: 4, Mac: 4, Other: 4 }, warnMonths: 12, staleDays: 60, licenseWarnDays: 90, currency: 'USD', lowUtilPct: 25, namePatterns: [], assetTagPrefix: 'LAB-', theme: 'wcu',
  autoImport: { mode: 'ask', seen: {} }, osSupport: [{ match: 'Windows 10', ends: '2025-10-14' }], budgets: {}, blackouts: [], targetUtil: 70,
  proposalTemplate: { intro: 'This request seeks funding to replace aging computers in the labs listed below. These labs support instruction and independent student work, and the equipment has reached or passed its planned service life.', risk: 'Deferring replacement increases the risk of hardware failure during the term, unsupported operating systems and software, loss of manufacturer warranty coverage, and rising repair costs and downtime.' },
  fundingSources: ['Replacement budget', 'Tech fee project', 'Grant', 'Department funds', 'Donation', 'Other'],
  emailTemplate: {
    subject: 'Action needed: {lab} is due for replacement ({date})',
    intro: 'Hello {name},\n\nThe computers in {lab} are scheduled for replacement around {date}. So we can plan the new setup and imaging, please review the details below and reply by {deadline} to:\n  1. Confirm the application list and the version of each title that must be installed.\n  2. Tell us about any applications to add, remove or upgrade, and any licensing or compatibility concerns.\n  3. Confirm the details of the devices (quantity, specifications, peripherals, special configurations).',
    outro: 'Thank you,\n{sender}'
  } };

function emptyData() {
  const d = { schema: 1, rev: 0, saveId: '', savedAt: '', savedBy: '', settings: clone(DEFAULT_SETTINGS), audit: [] };
  TABLES.forEach(t => d[t] = []);
  return d;
}
function normalizeData(d) {
  const out = Object.assign(emptyData(), d);
  out.settings = Object.assign(clone(DEFAULT_SETTINGS), d.settings || {});
  out.settings.lifecycle = Object.assign({}, DEFAULT_SETTINGS.lifecycle, out.settings.lifecycle || {});
  TABLES.forEach(t => { if (!Array.isArray(out[t])) out[t] = []; });
  if (!Array.isArray(out.audit)) out.audit = [];
  return out;
}

const IDB = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('lab-tracker', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { try { const db = await this.open(); return await new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); } catch { return null; } },
  async set(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = res; t.onerror = () => rej(t.error); }); } catch (e) { console.warn(e); } },
  async del(k) { try { const db = await this.open(); await new Promise(res => { const t = db.transaction('kv', 'readwrite').objectStore('kv').delete(k); t.onsuccess = res; t.onerror = res; }); } catch { } }
};

// ---------- storage back-ends ----------
class FolderStore {
  constructor(dir, readOnly) { this.dir = dir; this.kind = 'folder'; this.name = dir.name; this.readOnly = readOnly; }
  async read() {
    try {
      const f = await (await this.dir.getFileHandle(DATA_FILE)).getFile();
      const text = await f.text();
      return { data: JSON.parse(text), text, stamp: f.lastModified + ':' + f.size };
    } catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  }
  async listImports() {
    try { const d = await this.dir.getDirectoryHandle('imports'), out = []; for await (const [n, h] of d.entries()) if (h.kind === 'file' && /\.csv$/i.test(n)) { const f = await h.getFile(); out.push({ name: n, stamp: f.lastModified + ':' + f.size, modified: f.lastModified, file: f }); } return out; } catch { return []; }
  }
  async ensureImportsDir() { await this.dir.getDirectoryHandle('imports', { create: true }); }
  async listBackups() { try { const bd = await this.dir.getDirectoryHandle('backups'), n = []; for await (const [name] of bd.entries()) if (/^lab-tracker-\d{4}-\d{2}-\d{2}\.json$/.test(name)) n.push(name); return n.sort().reverse(); } catch { return []; } }
  async readBackup(name) { const bd = await this.dir.getDirectoryHandle('backups'); return (await (await bd.getFileHandle(name)).getFile()).text(); }
  async keepDamaged() { try { const t = await (await (await this.dir.getFileHandle(DATA_FILE)).getFile()).text(); const w = await (await this.dir.getFileHandle(`lab-tracker-data.damaged-${Date.now()}.json`, { create: true })).createWritable(); await w.write(t); await w.close(); } catch { } }
  async stat() { try { const f = await (await this.dir.getFileHandle(DATA_FILE)).getFile(); return f.lastModified + ':' + f.size; } catch { return null; } }
  async write(text) {
    const w = await (await this.dir.getFileHandle(DATA_FILE, { create: true })).createWritable();
    await w.write(text); await w.close();
  }
  async backupIfNeeded(text) {
    const day = todayStr();
    if (this._bk === day || !text) return;
    try {
      const bd = await this.dir.getDirectoryHandle('backups', { create: true });
      const name = `lab-tracker-${day}.json`;
      let exists = true; try { await bd.getFileHandle(name); } catch { exists = false; }
      if (!exists) {
        const w = await (await bd.getFileHandle(name, { create: true })).createWritable();
        await w.write(text); await w.close();
        const names = []; for await (const [n] of bd.entries()) if (/^lab-tracker-\d{4}-\d{2}-\d{2}\.json$/.test(n)) names.push(n);
        names.sort(); while (names.length > 60) await bd.removeEntry(names.shift());
      }
      this._bk = day;
    } catch (e) { console.warn('backup failed', e); }
  }
  async acquire() {
    const me = uid(), deadline = Date.now() + 12000;
    const readLock = async () => { try { return JSON.parse(await (await (await this.dir.getFileHandle(LOCK_FILE)).getFile()).text()); } catch { return null; } };
    while (true) {
      const cur = await readLock();
      if (!cur || Date.now() - cur.t > 15000) {
        const w = await (await this.dir.getFileHandle(LOCK_FILE, { create: true })).createWritable();
        await w.write(JSON.stringify({ id: me, u: DB.user, t: Date.now() })); await w.close();
        await sleep(150 + Math.random() * 150);
        const chk = await readLock();
        if (chk && chk.id === me) { this._lock = me; return; }
      }
      if (Date.now() > deadline) return; // busy or stale: proceed, the verify-after-write loop still protects the data
      await sleep(250 + Math.random() * 400);
    }
  }
  async release() {
    if (!this._lock) return;
    try { const c = JSON.parse(await (await (await this.dir.getFileHandle(LOCK_FILE)).getFile()).text()); if (c.id === this._lock) await this.dir.removeEntry(LOCK_FILE); } catch { }
    this._lock = null;
  }
}
// In-memory store: demo (persisted in this browser) or "file mode" for browsers that cannot write to folders.
class MemStore {
  constructor(kind, name, key) { this.kind = kind; this.name = name; this.key = key; this.text = key ? localStorage.getItem(key) : null; this.n = 0; this.unsaved = false; }
  async read() { if (!this.text) return null; return { data: JSON.parse(this.text), text: this.text, stamp: 'm' + this.n }; }
  async stat() { return 'm' + this.n; }
  async write(text) { this.text = text; this.n++; this.unsaved = true; if (this.key) try { localStorage.setItem(this.key, text); } catch { toast('Browser storage is full', 'err'); } }
}

// ---------- integrity ----------
const totalRecords = d => TABLES.reduce((a, t) => a + (Array.isArray(d[t]) ? d[t].length : 0), 0);
const DATA_COUNTS = d => Object.fromEntries(TABLES.map(t => [t, (d[t] || []).length]));
const integrityErr = msg => Object.assign(new Error(msg), { integrity: true });
// A file is "damaged" if it is not an object, a table is not a list, or the record counts it recorded no longer match its content.
function validateData(d) {
  const p = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['not a tracker data file'];
  TABLES.forEach(t => { if (d[t] !== undefined && !Array.isArray(d[t])) p.push(`table “${t}” is not a list`); });
  if (d.counts && typeof d.counts === 'object') TABLES.forEach(t => { if (d.counts[t] != null && (d[t] || []).length !== d.counts[t]) p.push(`${t}: file says ${d.counts[t]} records but contains ${(d[t] || []).length}`); });
  return p;
}
async function readChecked(store) {
  let r;
  try { r = await store.read(); } catch (e) { if (e instanceof SyntaxError) throw Object.assign(new Error('the data file is not valid JSON (it may be truncated)'), { damaged: true }); throw e; }
  if (r) { const probs = validateData(r.data); if (probs.length) throw Object.assign(new Error(probs.join('; ')), { damaged: true }); }
  return r;
}

// ---------- the database ----------
const DB = {
  data: emptyData(), store: null, user: '', readOnly: false, saving: false, status: 'idle', lastSaved: '', lastBy: '',
  rev: 0, stamp: null, mut: 0, lastTotal: 0, halted: false, touched: {}, baseRec: {}, settingsTouched: {}, settingsBase: {}, notes: [], _idx: {}, _timer: null,

  idx(t) { return this._idx[t] || (this._idx[t] = new Map(this.data[t].map(r => [r.id, r]))); },
  get(t, id) { return id ? this.idx(t).get(id) : undefined; },
  dirty() { return this.notes.length > 0 || Object.keys(this.touched).some(t => Object.keys(this.touched[t]).length) || Object.keys(this.settingsTouched).length > 0; },
  log(msg) { this.notes.push(msg); },

  snap(t, id) {
    const b = (this.baseRec[t] ??= {});
    if (!(id in b)) { const cur = this.idx(t).get(id); b[id] = cur ? clone(cur) : null; }
  },
  put(t, rec) {
    if (this.readOnly) { toast('This session is read-only', 'err'); return rec; }
    if (!rec.id) rec.id = uid();
    this.snap(t, rec.id);
    rec._u = new Date().toISOString(); rec._b = this.user;
    const cur = this.idx(t).get(rec.id);
    let out = rec;
    if (cur) { if (cur !== rec) Object.assign(cur, rec); out = cur; }
    else { this.data[t].push(rec); this.idx(t).set(rec.id, rec); }
    (this.touched[t] ??= {})[rec.id] = true;
    this.mut++; this.scheduleSave();
    return out;
  },
  remove(t, id) {
    if (this.readOnly) { toast('This session is read-only', 'err'); return; }
    const cur = this.idx(t).get(id); if (!cur) return;
    this.snap(t, id);
    this.data[t].splice(this.data[t].indexOf(cur), 1); this.idx(t).delete(id);
    (this.touched[t] ??= {})[id] = true;
    this.mut++; this.scheduleSave();
  },
  setSetting(k, v) {
    if (this.readOnly) return;
    if (!(k in this.settingsBase)) this.settingsBase[k] = clone(this.data.settings[k]);
    this.data.settings[k] = v; this.settingsTouched[k] = true; this.mut++; this.scheduleSave();
  },
  scheduleSave(ms = 700) {
    clearTimeout(this._timer); this._timer = setTimeout(() => this.flush(), ms); updateStatus();
  },

  takePending() {
    const p = { touched: this.touched, baseRec: this.baseRec, settingsTouched: this.settingsTouched, notes: this.notes, mine: {}, mineSettings: {} };
    for (const t in p.touched) { p.mine[t] = {}; for (const id in p.touched[t]) p.mine[t][id] = clone(this.idx(t).get(id) || null); }
    for (const k in p.settingsTouched) p.mineSettings[k] = clone(this.data.settings[k]);
    this.touched = {}; this.baseRec = {}; this.settingsTouched = {}; this.settingsBase = {}; this.notes = [];
    return p;
  },
  restorePending(p) {
    for (const t in p.touched) for (const id in p.touched[t]) { (this.touched[t] ??= {})[id] = true; (this.baseRec[t] ??= {})[id] = p.baseRec[t][id]; }
    for (const k in p.settingsTouched) this.settingsTouched[k] = true;
    this.notes = p.notes.concat(this.notes);
  },
  // Field-level 3-way merge: apply only what *I* changed (vs. the version I loaded) onto the latest file contents.
  applyPending(disk, p) {
    for (const t of TABLES) {
      if (!p.touched[t]) continue;
      const map = new Map(disk[t].map(r => [r.id, r]));
      for (const id in p.touched[t]) {
        const mine = p.mine[t][id], base = p.baseRec[t][id], cur = map.get(id);
        if (mine === null) map.delete(id);
        else if (!cur || !base) map.set(id, mine);
        else {
          const out = { ...cur };
          for (const k of new Set([...Object.keys(mine), ...Object.keys(base)])) {
            if (!eq(mine[k], base[k])) { if (k in mine) out[k] = mine[k]; else delete out[k]; }
          }
          map.set(id, out);
        }
      }
      disk[t] = [...map.values()];
    }
    for (const k in p.mineSettings) disk.settings[k] = p.mineSettings[k];
    const counts = [], items = []; let total = 0;
    const show = v => { const t = Array.isArray(v) ? v.join(', ') : (v && typeof v === 'object') ? JSON.stringify(v) : String(v ?? ''); return t.length > 70 ? t.slice(0, 69) + '…' : t; };
    const SKIP = /^_|^lastImport$|^missing$|^lsSeen$/;
    for (const t in p.touched) {
      let a = 0, u = 0, d = 0;
      for (const id in p.touched[t]) {
        const m = p.mine[t][id], b = p.baseRec[t][id];
        if (m === null) d++; else if (!b) a++; else u++;
        total++;
        if (items.length >= 60) continue;
        let f;
        if (m && b) {
          f = {}; for (const k of new Set([...Object.keys(m), ...Object.keys(b)])) { if (!SKIP.test(k) && !eq(m[k], b[k])) f[k] = [show(b[k]), show(m[k])]; }
          if (!Object.keys(f).length) { total--; continue; }
          if (Object.keys(f).length > 8) f = Object.fromEntries(Object.entries(f).slice(0, 8));
        }
        const rec = m || b;
        items.push({ t, id, a: m === null ? 'del' : !b ? 'add' : 'edit', n: show(recName(t, rec)), l: rec.labId || (t === 'labs' ? id : ''), f });
      }
      if (a + u + d) counts.push(`${t}: +${a} ~${u} -${d}`);
    }
    if (counts.length || p.notes.length || Object.keys(p.mineSettings).length) {
      disk.audit.push({ t: new Date().toISOString(), u: DB.user, n: p.notes.slice(0, 15), c: counts, s: Object.keys(p.mineSettings), i: items, m: Math.max(0, total - items.length) });
      if (disk.audit.length > 1200) disk.audit.splice(0, disk.audit.length - 1200);
    }
    return disk;
  },
  // Take the shared file's contents, but keep anything I've edited that hasn't been saved yet.
  adoptRemote(remote, stamp) {
    remote = normalizeData(remote);
    for (const t of TABLES) {
      const lt = this.touched[t] || {}, seen = new Set(), next = [];
      for (const r of remote[t]) {
        seen.add(r.id);
        if (lt[r.id]) { const mine = this.idx(t).get(r.id); if (mine) next.push(mine); } else next.push(r);
      }
      for (const id in lt) if (!seen.has(id)) { const mine = this.idx(t).get(id); if (mine) next.push(mine); }
      remote[t] = next;
    }
    for (const k in this.settingsTouched) remote.settings[k] = this.data.settings[k];
    this.data = remote; this._idx = {}; this.rev = remote.rev; if (stamp) this.stamp = stamp;
    this.lastSaved = remote.savedAt; this.lastBy = remote.savedBy; this.mut++; this.lastTotal = totalRecords(this.data);
  },

  guard(diskData, merged, p) {
    const before = totalRecords(diskData), after = totalRecords(merged); let del = 0;
    for (const t in p.touched) for (const id in p.touched[t]) if (p.mine[t][id] === null) del++;
    if (this.lastTotal >= 20 && before < this.lastTotal * 0.7) throw integrityErr(`The shared file now holds ${before} records but had ${this.lastTotal} when it was last loaded – it may have been truncated or emptied. Saving was stopped so good data isn’t overwritten. Use Settings → Data safety to restore a backup.`);
    if (before >= 20 && after < before * 0.7 && before - after > del + 5) throw integrityErr(`This save would remove ${before - after} records you didn’t delete. Saving was stopped.`);
  },
  resume() { this.halted = false; this.status = 'idle'; updateStatus(); this.scheduleSave(100); },
  async flush() {
    if (this.readOnly || !this.store || this.halted) return;
    if (this.saving) { this.again = true; return; }
    if (!this.dirty()) return;
    this.saving = true; this.again = false; this.status = 'busy'; updateStatus();
    const p = this.takePending(), store = this.store;
    try {
      await store.acquire?.();
      let done = null;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        const disk = await readChecked(store);
        if (!disk) throw new Error('The data file is missing from the shared folder.');
        if ((disk.data.schema || 1) > 1) throw new Error('The data file was written by a newer version of the tracker.');
        const merged = this.applyPending(normalizeData(disk.data), p);
        this.guard(disk.data, merged, p);
        merged.rev = (merged.rev || 0) + 1; merged.saveId = uid(); merged.savedAt = new Date().toISOString(); merged.savedBy = this.user; merged.counts = DATA_COUNTS(merged);
        await store.backupIfNeeded?.(disk.text);
        await store.write(JSON.stringify(merged));
        const chk = await store.read();
        if (chk && chk.data.saveId === merged.saveId) done = { merged, stamp: chk.stamp };
        // otherwise someone else wrote at the same moment: loop re-reads and re-merges on top of theirs
        if (!done) await sleep(200 + Math.random() * 400);
      }
      if (!done) throw new Error('Could not save because someone else was saving at the same moment. Your change will be retried.');
      this.adoptRemote(done.merged, done.stamp);
      this.status = 'idle'; this.errMsg = '';
    } catch (e) {
      console.error(e); this.restorePending(p); this.status = 'err'; this.errMsg = e.message;
      if (e.integrity || e.damaged) { this.halted = true; toast('Saving paused: ' + e.message, 'err'); }
      else { toast('Save failed: ' + e.message, 'err'); this.scheduleSave(10000); }
    } finally {
      await store.release?.();
      this.saving = false; updateStatus();
      if (!this.halted && (this.again || this.dirty())) { if (this.status !== 'err') this.scheduleSave(200); }
    }
  },

  async poll() {
    if (this.saving || !this.store || this.dirty() && this.status === 'err') return;
    try {
      const st = await this.store.stat();
      if (st && st !== this.stamp) {
        const disk = await readChecked(this.store);
        if (disk && this.lastTotal >= 20 && totalRecords(disk.data) < this.lastTotal * 0.7) { this.halted = true; this.status = 'err'; updateStatus(); toast('The shared file suddenly holds far fewer records. Not loading it and pausing saves – check Settings → Data safety.', 'err'); this.stamp = disk.stamp; return; }
        if (disk && disk.data.rev !== this.rev) { this.adoptRemote(disk.data, disk.stamp); onRemoteChange(); }
        else if (disk) this.stamp = disk.stamp;
      }
    } catch (e) { console.warn('poll', e); if (e.damaged && !this.halted) { this.halted = true; this.status = 'err'; updateStatus(); toast('The shared data file looks damaged (' + e.message + '). Saving paused – see Settings → Data safety.', 'err'); } }
  },

  // Replace everything (restore from backup)
  async replaceAll(data) {
    const store = this.store;
    await store.acquire?.();
    try {
      const disk = await store.read();
      const d = normalizeData(data);
      d.rev = (disk?.data?.rev || 0) + 1; d.saveId = uid(); d.savedAt = new Date().toISOString(); d.savedBy = this.user;
      d.counts = DATA_COUNTS(d); d.audit.push({ t: d.savedAt, u: this.user, n: ['Restored from backup file'], c: [], s: [] });
      if (disk) await store.backupIfNeeded?.(disk.text);
      await store.write(JSON.stringify(d));
      this.touched = {}; this.baseRec = {}; this.settingsTouched = {}; this.notes = [];
      this.adoptRemote(d, (await store.read()).stamp);
    } finally { await store.release?.(); }
  }
};

function updateStatus() {
  const el = $('#sync'); if (!el) return;
  const s = DB.store; let cls = '', txt = '';
  if (!s) txt = 'Not connected';
  else if (DB.halted) { cls = 'err'; txt = 'Saving paused – integrity check'; }
  else if (DB.status === 'err') { cls = 'err'; txt = 'Save failed – retrying'; }
  else if (DB.saving) { cls = 'busy'; txt = 'Saving…'; }
  else if (DB.dirty()) { cls = 'busy'; txt = 'Unsaved changes…'; }
  else {
    const when = DB.lastSaved ? new Date(DB.lastSaved).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    if (s.kind === 'demo') { cls = 'demo'; txt = 'Demo data (stored in this browser)'; }
    else if (s.kind === 'file') { cls = 'demo'; txt = s.unsaved ? 'File mode – download to keep changes' : 'File mode'; }
    else txt = `Shared folder “${s.name}”${when ? ` · saved ${when}${DB.lastBy ? ' by ' + DB.lastBy : ''}` : ''}${DB.readOnly ? ' · view only' : ''}`;
  }
  el.className = cls; $('#sync-t').textContent = txt;
  $('#btn-dl').hidden = !(s && s.kind === 'file');
  document.body.classList.toggle('ro', !!DB.readOnly);
}
