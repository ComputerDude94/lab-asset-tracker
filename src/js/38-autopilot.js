// Windows Autopilot hardware-hash CSVs: every device's export has the same heading row plus one data row.
// This merges many exports into one file with the heading once (Intune's import wants exactly these five columns, no BOM).
// Hashes are sensitive and large, so they are never saved into the tracker's data file; they stay in this page until you download or save them.
const AP_HEAD = ['Device Serial Number', 'Windows Product ID', 'Hardware Hash', 'Group Tag', 'Assigned User'];
const AP_SHARE_FILE = 'autopilot-hashes.csv', AP_LIMIT = 500;
const apKey = r => (r[0] || '').trim().toLowerCase() || (r[2] || '').slice(0, 64);
function apParse(name, text, mtime = 0) {
  const all = parseCSV(text).filter(r => r.some(c => String(c).trim() !== '')), out = { name, mtime, rows: [], problems: [], notes: [] };
  if (!all.length) { out.problems.push('The file is empty'); return out; }
  const head = all[0].map(h => String(h).replace(/^﻿/, '').trim().toLowerCase()), idx = AP_HEAD.map(h => head.indexOf(h.toLowerCase()));
  if (idx[0] < 0 || idx[2] < 0) { out.problems.push('Headings don’t match (need Device Serial Number and Hardware Hash)'); return out; }
  const data = all.slice(1);
  if (!data.length) { out.problems.push('Only a heading row, no device'); return out; }
  if (data.length > 1) out.notes.push(`${data.length} device rows (all kept)`);
  data.forEach(r => {
    const row = idx.map(i => i < 0 ? '' : String(r[i] ?? '').trim());
    if (!row[0] && !row[2]) { out.notes.push('A row with no serial and no hash was skipped'); return; }
    if (!row[2]) out.notes.push(`${row[0] || 'A row'} has no hardware hash, so Autopilot can’t register it`);
    out.rows.push(row);
  });
  return out;
}
function apMerge(files, tag, user) {
  const map = new Map(); let dup = 0;
  [...files].sort((a, b) => a.mtime - b.mtime).forEach(f => f.rows.forEach(r => { const row = [...r]; if (tag) row[3] = tag; if (user) row[4] = user; const k = apKey(row); if (map.has(k)) dup++; map.set(k, row); }));
  return { rows: [...map.values()], dup };
}
const apText = rows => toCSV([AP_HEAD, ...rows]) + '\r\n';
function apDownload(name, text) {   // no BOM: a BOM would corrupt the first heading for Intune
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function apAppendToShare(rows) {
  const st = DB.store; if (st.kind !== 'folder' || !st.dir || DB.readOnly) throw new Error('Open the shared folder with write access first');
  await st.acquire();
  try {
    let existing = []; try { const f = apParse(AP_SHARE_FILE, await (await (await st.dir.getFileHandle(AP_SHARE_FILE)).getFile()).text()); if (f.problems.length) throw new Error(`${AP_SHARE_FILE} already exists but ${f.problems[0].toLowerCase()}`); existing = f.rows; } catch (e) { if (e.name !== 'NotFoundError') throw e; }
    const have = new Set(existing.map(apKey)), fresh = rows.filter(r => !have.has(apKey(r)));
    if (fresh.length) { const w = await (await st.dir.getFileHandle(AP_SHARE_FILE, { create: true })).createWritable(); await w.write(apText([...existing, ...fresh])); await w.close(); }
    return { added: fresh.length, skipped: rows.length - fresh.length, total: existing.length + fresh.length };
  } finally { await st.release(); }
}

function autopilotImport(host) {
  const A = UI.ap ??= { files: [], tag: '', user: '' };
  const draw = () => {
    const m = apMerge(A.files.filter(f => !f.problems.length), A.tag, A.user), bad = A.files.filter(f => f.problems.length), canShare = DB.store?.kind === 'folder' && !DB.readOnly;
    const parts = Math.ceil(m.rows.length / AP_LIMIT);
    host.innerHTML = `<div class="card"><p class="small muted">Each Autopilot export has the same five headings and one device. Drop them all here (or pick the folder they’re in) and get <b>one file with the headings once</b>: <code>${AP_HEAD.join(', ')}</code>. Nothing is uploaded, and hardware hashes are <b>not</b> stored in the tracker’s data file.</p>
    <div class="drop" id="ap-drop"><p><b>Drop the exported CSV files here</b> or <label style="color:var(--accent);cursor:pointer;text-decoration:underline">choose files<input type="file" id="ap-files" accept=".csv,.txt" multiple hidden></label>${HAS_FSA ? ` or <a href="#" id="ap-dir">pick a folder of exports</a>` : ''}</p></div>
    ${A.files.length ? `<div class="toolbar" style="margin-top:12px"><div class="field"><label>Group Tag for every device</label><input id="ap-tag" value="${esc(A.tag)}" placeholder="blank = keep each file’s value"></div><div class="field"><label>Assigned User for every device</label><input id="ap-user" value="${esc(A.user)}" placeholder="blank = keep each file’s value"></div><span class="spacer"></span><button class="btn" id="ap-clear">Start over</button></div>
    <div class="kpis"><div class="kpi"><div class="v">${A.files.length}</div><div class="l">Files read</div></div><div class="kpi good"><div class="v">${m.rows.length}</div><div class="l">Devices combined</div></div><div class="kpi ${m.dup ? 'warnk' : ''}"><div class="v">${m.dup}</div><div class="l">Duplicates removed</div><div class="s">same serial; newest file wins</div></div><div class="kpi ${bad.length ? 'bad' : ''}"><div class="v">${bad.length}</div><div class="l">Files rejected</div></div></div>
    <div class="chips"><button class="btn primary" id="ap-dl"${m.rows.length ? '' : ' disabled'}>Download combined CSV${parts > 1 ? ` (${parts} files of up to ${AP_LIMIT})` : ''}</button>${canShare ? `<button class="btn" id="ap-share"${m.rows.length ? '' : ' disabled'}>Add new devices to ${AP_SHARE_FILE} in the data folder</button>` : ''}</div>
    ${parts > 1 ? `<p class="small muted">Intune’s Autopilot import limits each file to ${AP_LIMIT} devices, so this is split into ${parts} files.</p>` : ''}
    <h3 style="margin-top:14px">Files</h3><div class="tbl-wrap"><table><thead><tr><th>File</th><th class="num">Devices</th><th>Result</th></tr></thead><tbody>${A.files.map(f => `<tr><td>${esc(f.name)}</td><td class="num">${f.rows.length}</td><td class="small">${f.problems.length ? `<span class="badge bad">Rejected</span> ${esc(f.problems.join('; '))}` : `<span class="badge ok">OK</span> ${esc(f.notes.join('; '))}`}</td></tr>`).join('')}</tbody></table></div>
    ${m.rows.length ? `<h3 style="margin-top:14px">Preview (first 8 of ${m.rows.length})</h3><div class="tbl-wrap"><table><thead><tr>${AP_HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${m.rows.slice(0, 8).map(r => `<tr>${r.map((v, i) => `<td class="small">${esc(i === 2 && v.length > 18 ? v.slice(0, 18) + '… (' + v.length + ' chars)' : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}` : ''}</div>`;
    const add = async files => {
      const got = []; for (const f of files) { try { got.push(apParse(f.name, await readFileText(f), f.lastModified || 0)); } catch (e) { got.push({ name: f.name, rows: [], problems: [e.message], notes: [], mtime: 0 }); } }
      const names = new Set(got.map(g => g.name)); A.files = [...A.files.filter(f => !names.has(f.name)), ...got]; draw();
    };
    const dz = $('#ap-drop', host), inp = $('#ap-files', host);
    inp.onchange = () => add([...inp.files]); dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); add([...e.dataTransfer.files].filter(f => /\.(csv|txt)$/i.test(f.name))); };
    const pd = $('#ap-dir', host); if (pd) pd.onclick = async e => { e.preventDefault(); try { const dir = await showDirectoryPicker({ id: 'autopilot', mode: 'read' }), fs = []; for await (const [n, h] of dir.entries()) if (h.kind === 'file' && /\.csv$/i.test(n) && n.toLowerCase() !== AP_SHARE_FILE) fs.push(await h.getFile()); if (!fs.length) toast('No CSV files in that folder', 'err'); else add(fs); } catch (err) { if (err.name !== 'AbortError') toast(err.message, 'err'); } };
    if (!A.files.length) return;
    $('#ap-tag', host).onchange = e => { A.tag = e.target.value.trim(); draw(); }; $('#ap-user', host).onchange = e => { A.user = e.target.value.trim(); draw(); };
    $('#ap-clear', host).onclick = () => { A.files = []; A.tag = A.user = ''; draw(); };
    $('#ap-dl', host).onclick = () => {
      const stamp = todayStr(); for (let i = 0; i < parts; i++) apDownload(`autopilot-combined${parts > 1 ? '-' + (i + 1) + 'of' + parts : ''}_${stamp}.csv`, apText(m.rows.slice(i * AP_LIMIT, (i + 1) * AP_LIMIT)));
      if (!DB.readOnly) DB.log(`Combined ${A.files.length} Autopilot hash file(s) into ${m.rows.length} device(s)`); toast(`Downloaded ${parts} file${parts > 1 ? 's' : ''}`);
    };
    const sh = $('#ap-share', host); if (sh) sh.onclick = async () => { try { const r = await apAppendToShare(m.rows); DB.log(`Added ${r.added} Autopilot device(s) to ${AP_SHARE_FILE}`); toast(`Added ${r.added} new device(s); ${r.skipped} already there; ${r.total} total in ${AP_SHARE_FILE}`); } catch (e) { toast(e.message, 'err'); } };
  };
  draw();
}
