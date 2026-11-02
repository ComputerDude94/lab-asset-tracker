// Pilot tools for the shared folder: a note for IT, and a two-computer save test that proves the lock file stops lost updates.
function itNoteText() {
  const st = DB.store, nm = st.kind === 'folder' ? st.name : '(not in folder mode)';
  return `Lab Asset Tracker - setup note for IT
Generated ${new Date().toLocaleString()} by ${DB.user}

WHAT IT IS
A single HTML file (lab-tracker.html) with no server, installer or internet access needed. It reads and writes one data file in a shared folder.

WHAT IT NEEDS
1. A folder on the network share (this one is "${nm}") containing lab-tracker.html.
2. Read AND write (create, modify, delete) permission on that folder for every person who edits. Read-only users can be given read permission only.
3. Users open lab-tracker.html in Microsoft Edge or Google Chrome (the File System Access API is required for shared-folder saving) and choose the folder once. The browser asks for permission again after it restarts or after a long time; that is normal.
4. The folder must be reachable as a normal path (mapped drive or UNC path such as \\\\server\\share\\LabTracker). SharePoint/OneDrive sync folders are not recommended: sync delays can cause conflicts.

FILES CREATED IN THE FOLDER
- lab-tracker-data.json       the database (the only file that matters)
- lab-tracker.lock            short-lived lock while someone saves (deleted automatically; stale after 15 s)
- backups\\                    one backup per day, the newest 60 are kept
- imports\\                    optional: drop exports here (intune-devices.csv, mosyle-devices.csv, labstats-stations.csv, labstats-usage.csv, warranty.csv, installed-apps.csv)

BACKUP AND RECOVERY
Include the whole folder in your normal share backups. To restore, copy a file from backups\\ over lab-tracker-data.json while nobody is editing. The tracker also offers the newest backup automatically if it finds a damaged data file.

LIMITS TO KNOW ABOUT
- It is a shared file, not a database server. It is designed for roughly 5-10 people editing occasionally.
- Anyone with write access to the folder can change or delete the data file or the HTML file. The in-app users and roles are for attribution, not security.
- Saving merges changes field by field, so two people editing different things is safe; two people editing the same field at once is last-writer-wins.

IF YOU NEED STRONGER GUARANTEES
Move the data to a small server (SQLite or Postgres) with Entra ID sign-in. The storage code is isolated in src/js/01-store.js.
`;
}
const PILOT_FILE = 'pilot-counter.json', pilotKey = () => `${DB.user} (${(UI.pilotId ??= uid().slice(0, 4))})`;
async function pilotReadCounter(st) { try { return JSON.parse(await (await (await st.dir.getFileHandle(PILOT_FILE)).getFile()).text()); } catch { return { n: 0, by: {} }; } }
async function pilotRun(st, rounds, tick) {
  for (let i = 0; i < rounds; i++) {
    await st.acquire();
    try {
      const c = await pilotReadCounter(st); c.n++; c.by[pilotKey()] = (c.by[pilotKey()] || 0) + 1;
      const w = await (await st.dir.getFileHandle(PILOT_FILE, { create: true })).createWritable(); await w.write(JSON.stringify(c)); await w.close();
    } finally { await st.release(); }
    tick(i + 1); await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
  }
}
function pilotDialog() {
  const st = DB.store; if (st.kind !== 'folder' || DB.readOnly) return toast('Open the shared folder with write access first', 'err');
  const body = document.createElement('div');
  body.innerHTML = `<p class="muted small">Proves that two people saving at the same moment don’t overwrite each other. Do this on <b>two computers at once</b>: both open the tracker on the shared folder, both open this test, then press <b>Run</b> on both within a few seconds. Each run makes 20 locked updates to a scratch file (<code>${PILOT_FILE}</code>, not your data). Afterwards press <b>Check result</b>.</p>
    <p><button class="btn primary" id="p-run">Run</button> <button class="btn" id="p-chk">Check result</button> <button class="btn" id="p-clr">Delete test file</button></p><div id="p-out" class="small"></div>`;
  const out = $('#p-out', body);
  $('#p-run', body).onclick = async () => { try { await pilotRun(st, 20, n => { out.textContent = `Running… ${n}/20`; }); out.textContent = 'Done – now press Check result (after the other computer finishes too).'; } catch (e) { out.innerHTML = `<span class="badge bad">failed</span> ${esc(e.message)}`; } };
  $('#p-chk', body).onclick = async () => {
    const c = await pilotReadCounter(st), total = sum(Object.values(c.by), v => v), ok = c.n === total;
    out.innerHTML = `<span class="badge ${ok ? 'ok' : 'bad'}">${ok ? 'pass' : 'LOST UPDATES'}</span> file counter ${c.n}, updates made ${total}${ok ? '' : ' – the lock did not protect writes on this share. Do not rely on multi-user saving here.'}<br>${Object.entries(c.by).map(([k, v]) => `${esc(k)}: ${v}`).join('<br>')}${Object.keys(c.by).length < 2 ? '<br><span class="muted">Only one computer has run so far – this proves little until two have.</span>' : ''}`;
  };
  $('#p-clr', body).onclick = async () => { try { await st.dir.removeEntry(PILOT_FILE); out.textContent = 'Test file deleted.'; } catch { out.textContent = 'Nothing to delete.'; } };
  modal({ title: 'Two-computer save test', body, buttons: [{ label: 'Close', cls: 'primary' }] });
}
