// Data safety: health check of the shared folder, "export everything", and the Settings card that ties them together.
async function runHealthChecks() {
  const st = DB.store, r = [], add = (n, ok, d, warn) => r.push({ n, ok, d, warn });
  add('Browser can use a shared folder', st.kind !== 'folder' || HAS_FSA, st.kind === 'folder' ? 'File System Access API available' : `Storage mode: ${st.kind}`);
  try {
    const disk = await readChecked(st);
    if (!disk) add('Data file is readable and consistent', false, 'The data file is missing.');
    else add('Data file is readable and consistent', true, `${totalRecords(disk.data)} records, version ${disk.data.rev}, ${(disk.text.length / 1024).toFixed(0)} KB, last saved ${disk.data.savedAt ? new Date(disk.data.savedAt).toLocaleString() : '—'} by ${disk.data.savedBy || '?'}`);
    if (disk) add('This browser is in sync with the file', disk.data.rev === DB.rev || DB.dirty(), `file version ${disk.data.rev}, loaded version ${DB.rev}${DB.dirty() ? ' (you have unsaved changes)' : ''}`, true);
  } catch (e) { add('Data file is readable and consistent', false, e.message); }
  add('Saving is not paused', !DB.halted, DB.halted ? 'Saving is paused by the integrity check – use “Resume saving” after fixing the cause.' : 'OK');
  add('Folder permission', !DB.readOnly, DB.readOnly ? 'View-only session' : 'Read and write');
  if (st.kind === 'folder') {
    try {
      const name = `healthcheck-${normKey(DB.user) || 'user'}.tmp`, stamp = String(Date.now()), t0 = performance.now();
      const w = await (await st.dir.getFileHandle(name, { create: true })).createWritable(); await w.write(stamp); await w.close();
      const back = await (await (await st.dir.getFileHandle(name)).getFile()).text(); await st.dir.removeEntry(name);
      add('Write, re-read and delete a test file', back === stamp, `round trip ${Math.round(performance.now() - t0)} ms`);
    } catch (e) { add('Write, re-read and delete a test file', false, e.message); }
    try { await st.acquire(); const ok = !!st._lock; await st.release(); add('Lock file works', ok, ok ? 'acquired and released' : 'could not take the lock – someone else may be saving; run again in a moment', !ok); } catch (e) { add('Lock file works', false, e.message); }
    try {
      const l = JSON.parse(await (await (await st.dir.getFileHandle(LOCK_FILE)).getFile()).text()); const age = (Date.now() - l.t) / 1000;
      add('No stale lock', age < 60, `a lock by ${l.u || '?'} is ${Math.round(age)} s old`, true);
    } catch { add('No stale lock', true, 'no lock file present'); }
    const bk = await st.listBackups();
    if (!bk.length) add('Daily backups', false, 'No backups yet – the first one is written when the first save of a day happens.', true);
    else {
      let ok = false, d = '';
      try { const t = JSON.parse(await st.readBackup(bk[0])); const probs = validateData(t); ok = !probs.length && totalRecords(t) > 0; d = `${bk.length} backups, newest ${bk[0].replace(/^lab-tracker-|\.json$/g, '')} (${totalRecords(t)} records)`; if (probs.length) d += ' – ' + probs.join('; '); } catch (e) { d = 'newest backup could not be read: ' + e.message; }
      const days = daysBetween(bk[0].replace(/^lab-tracker-|\.json$/g, ''), todayStr()); add('Daily backups', ok && days <= 3, d + (days > 3 ? ` – newest is ${days} days old` : ''), ok);
    }
    const imp = await st.listImports(); add('imports folder', true, imp.length ? `${imp.length} CSV file(s) present` : 'empty or not created (optional)');
  }
  return r;
}
async function healthDialog() {
  const body = document.createElement('div'); body.innerHTML = '<p class="muted">Running checks…</p>';
  modal({ title: 'Data safety health check', body, wide: true, buttons: [{ label: 'IT setup note', onClick: () => { download('lab-tracker-IT-note.txt', itNoteText(), 'text/plain'); return false; } }, { label: 'Two-computer save test…', onClick: () => { pilotDialog(); return false; } }, { label: 'Close', cls: 'primary' }] });
  const r = await runHealthChecks();
  body.innerHTML = `<table><thead><tr><th></th><th>Check</th><th>Result</th></tr></thead><tbody>${r.map(x => `<tr><td>${x.ok ? '<span class="badge ok">pass</span>' : x.warn ? '<span class="badge warn">warn</span>' : '<span class="badge bad">FAIL</span>'}</td><td>${esc(x.n)}</td><td class="small">${esc(x.d)}</td></tr>`).join('')}</tbody></table>
  <p class="small muted" style="margin-top:12px">Checks are done from this computer only. For a true multi-user test, run it from two computers, make edits on both at the same time, then run it again.</p>`;
}

// ---- export everything ----
const flat = v => Array.isArray(v) ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join('; ') : (v && typeof v === 'object') ? JSON.stringify(v) : v;
function tableCSV(rows, extra) {
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !/^_/.test(k));
  const ex = Object.keys(extra ? extra(rows[0] || {}) : {});
  return toCSV([[...keys, ...ex], ...rows.map(r => [...keys.map(k => flat(r[k])), ...(extra ? Object.values(extra(r)) : [])])]);
}
function exportEverything() {
  const D = DB.data, L = id => id ? labLabel(DB.get('labs', id)) : '';
  const ex = {
    labs: r => ({ building_name: DB.get('buildings', r.buildingId)?.name || '' }), hardware: r => ({ lab_label: L(r.labId), model_name: modelName(r) }), devices: r => ({ lab_label: L(r.labId) }),
    labSoftware: r => ({ lab_label: L(r.labId), software_name: DB.get('software', r.softwareId)?.name || '' }), maintenances: r => ({ lab_label: L(r.labId), device_name: DB.get('devices', r.deviceId)?.name || '' }),
    projects: r => ({ lab_label: L(r.labId) }), confirmations: r => ({ lab_label: L(r.labId), contact_name: DB.get('contacts', r.contactId)?.name || '' }), audits: r => ({ lab_label: L(r.labId) })
  };
  const files = [['lab-tracker-data.json', JSON.stringify(D)]];
  TABLES.forEach(t => { if (D[t].length) files.push([`csv/${t}.csv`, '﻿' + tableCSV(D[t], ex[t])]); });
  files.push(['csv/activity-log.csv', '﻿' + toCSV([['When', 'Who', 'Action', 'Type', 'Item', 'Changes'], ...activityRows().map(r => [r.when, r.who, r.a, TABLE_LABEL[r.t] || '', r.n, r.f ? Object.entries(r.f).map(([k, [o, n]]) => `${k}: ${o} -> ${n}`).join('; ') : ''])])]);
  files.push(['csv/settings.json', JSON.stringify(D.settings, null, 2)]);
  files.push(['README.txt', `Lab Asset Tracker export\r\nCreated ${new Date().toLocaleString()} by ${DB.user}\r\nData version ${DB.rev}, ${totalRecords(D)} records\r\n\r\nlab-tracker-data.json is the complete database: it can be restored with Settings > Restore from backup.\r\ncsv/ holds one spreadsheet-friendly file per table (ids are internal; *_label / *_name columns are added for readability).\r\n`]);
  downloadBlob(`lab-tracker-export-${todayStr()}.zip`, zipStore(files)); DB.log('Exported everything (zip)'); toast(`Exported ${files.length} files`);
}

// ---- Settings card ----
async function dataSafetyCardHTML() {
  const st = DB.store; let bk = [];
  if (st.kind === 'folder') bk = await st.listBackups();
  return `<div class="card"><div class="card-h"><h3>Data safety</h3></div>
  <p class="small muted">Every save is checked: the file must parse, its record counts must match, and a save that would lose or find a sharply smaller dataset is stopped (not overwritten) so you can restore a backup instead. ${st.kind === 'folder' ? `Daily backups: <b>${bk.length}</b>${bk[0] ? `, newest ${esc(bk[0].replace(/^lab-tracker-|\.json$/g, ''))}` : ''}. Keep your normal share backup running too – the backups folder is on the same share.` : ''}</p>
  ${DB.halted ? '<p><span class="badge bad">Saving is paused by the integrity check</span> After fixing the cause (restore a backup, or reload to load the current file), resume saving.</p>' : ''}
  <div class="chips"><button class="btn primary" id="ds-check" type="button">Run health check</button><button class="btn" id="ds-export" type="button">${ic('download')} Export everything (zip)</button>${DB.halted ? '<button class="btn edit-only" id="ds-resume" type="button">Resume saving</button>' : ''}</div></div>`;
}
function bindDataSafetyCard(root) {
  $('#ds-check', root).onclick = healthDialog; $('#ds-export', root).onclick = exportEverything;
  const r = $('#ds-resume', root); if (r) r.onclick = () => { DB.resume(); render(); };
}
