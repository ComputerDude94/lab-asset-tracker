// Lenovo warranty. Main route needs no key: build Lenovo's batch-upload file (.xlsx, max 1000 rows), upload it on Lenovo's batch warranty page,
// then import the exported results here. Optional route: the API with a ClientID (below). ASSUMPTIONS for the API route (not verified against Lenovo's own docs): GET https://supportapi.lenovo.com/v2.5/warranty?Serial=<serial>
// with a "ClientID" header; the JSON contains warranty entries with start/end dates. Lenovo issues the ClientID through your account rep.
// Browsers may block this call (CORS); tools/Get-LenovoWarranty.ps1 does the same lookup outside the browser and writes a CSV to import.
const LENOVO_API = 'https://supportapi.lenovo.com/v2.5/warranty';
const lenovoKey = () => { try { return localStorage.getItem('lt-lenovo-key') || ''; } catch { return ''; } };
const lenovoSupportUrl = serial => `https://pcsupport.lenovo.com/us/en/search?query=${encodeURIComponent(serial)}`;
const isLenovo = d => /lenovo/i.test(d.manufacturer || '') || /thinkcentre|thinkpad|thinkstation|ideapad|lenovo/i.test(d.model || '');

function collectWarranty(obj, acc = { starts: [], ends: [], names: [] }) {
  if (Array.isArray(obj)) obj.forEach(x => collectWarranty(x, acc));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        if (/^(end|enddate|warrantyend|warrantyenddate|expirationdate|expiry)$/i.test(k)) acc.ends.push(normDate(v));
        else if (/^(start|startdate|warrantystart|warrantystartdate)$/i.test(k)) acc.starts.push(normDate(v));
        else if (/^(name|description|servicelevel)$/i.test(k) && v) acc.names.push(v);
      } else collectWarranty(v, acc);
    }
  }
  return acc;
}
async function lenovoLookup(serial) {
  const key = lenovoKey(); if (!key) throw Object.assign(new Error('Add your Lenovo ClientID in Settings first.'), { nokey: true });
  let res;
  try { res = await fetch(`${LENOVO_API}?Serial=${encodeURIComponent(serial)}`, { headers: { ClientID: key } }); }
  catch { throw Object.assign(new Error('The browser blocked the request to Lenovo (CORS or network). Use the helper script instead.'), { blocked: true }); }
  if (res.status === 401 || res.status === 403) throw new Error('Lenovo rejected the ClientID (HTTP ' + res.status + ').');
  if (!res.ok) throw new Error('Lenovo returned HTTP ' + res.status + ' for ' + serial);
  const w = collectWarranty(await res.json()), ends = w.ends.filter(Boolean).sort(), starts = w.starts.filter(Boolean).sort();
  if (!ends.length) throw new Error('No warranty dates found for ' + serial);
  return { end: ends[ends.length - 1], start: starts[0] || '', product: w.names[0] || '' };    // latest end date wins when several warranties exist
}
function saveWarranty(d, w, source) {
  DB.put('devices', { ...d, warrantyEnd: w.end, warrantyStart: w.start || d.warrantyStart || '', warrantyProduct: w.product || d.warrantyProduct || '', warrantyChecked: todayStr(), warrantySource: source });
}
async function lenovoLookupDevices(ids) {
  const devs = ids.map(id => DB.get('devices', id)).filter(d => d && d.serial);
  if (!devs.length) return toast('None of the selected devices has a serial number.', 'err');
  const body = document.createElement('div'); body.innerHTML = '<p id="lw-msg">Starting…</p><div class="meter"><i id="lw-bar" style="width:0"></i></div><pre class="small" id="lw-log" style="max-height:180px;overflow:auto"></pre>';
  let stop = false; const logEl = () => $('#lw-log', body);
  modal({ title: 'Lenovo warranty lookup', body, buttons: [{ label: 'Stop', onClick: () => { stop = true; return true; } }] });
  let ok = 0, fail = 0;
  for (let i = 0; i < devs.length && !stop; i++) {
    const d = devs[i]; $('#lw-msg', body) && ($('#lw-msg', body).textContent = `Looking up ${d.serial} (${i + 1} of ${devs.length})…`);
    try { const w = await lenovoLookup(d.serial); saveWarranty(d, w, 'Lenovo API'); ok++; logEl() && (logEl().textContent += `${d.serial}: ends ${w.end}\n`); }
    catch (e) { fail++; logEl() && (logEl().textContent += `${d.serial}: ${e.message}\n`); if (e.blocked || e.nokey) { stop = true; } }
    $('#lw-bar', body) && ($('#lw-bar', body).style.width = ((i + 1) / devs.length * 100) + '%');
    await sleep(1100);
  }
  if ($('#lw-msg', body)) $('#lw-msg', body).textContent = `Done: ${ok} updated, ${fail} failed.`;
  if (ok) DB.log(`Looked up Lenovo warranty for ${ok} devices`);
}
function lenovoSerialsCSV() {
  return toCSV([['Serial', 'Name', 'Model'], ...DB.data.devices.filter(d => d.serial && isLenovo(d)).map(d => [d.serial, d.name, d.model])]);
}

// ---- batch route (no key) ----
const LENOVO_BATCH_URL = 'https://pcsupport.lenovo.com/us/en/warrantylookup/batchquery';
// Lenovo machine type = first 4 characters of the 10-character model string (e.g. 11U5S0KE00 -> 11U5), when the export reports it that way.
const lenovoMachineType = d => d.machineType || (/^[0-9A-Z]{10}$/i.test((d.model || '').trim()) ? d.model.trim().slice(0, 4).toUpperCase() : '');
function downloadBlob(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
function lenovoBatchDialog(ids) {
  const all = DB.data.devices.filter(d => d.serial && isLenovo(d));
  const sets = [
    ['all', `All Lenovo devices`, all], ['missing', 'Only devices with no warranty date yet', all.filter(d => !d.warrantyEnd)],
    ['soon', 'Unknown or ending within 12 months', all.filter(d => !d.warrantyEnd || daysBetween(todayStr(), d.warrantyEnd) <= 365)]
  ];
  if (ids) sets.unshift(['sel', 'Only the devices I selected', all.filter(d => ids.includes(d.id))]);
  const body = document.createElement('div');
  body.innerHTML = `<p class="small muted">Builds the upload file for Lenovo’s <b>Batch Warranty Lookup</b> (columns <code>Machine Type</code> and <code>SerialorIMEI</code>), split into files of up to 1,000 serials. No key or account needed.</p>
  ${sets.map(([k, l, a], i) => `<label class="chk" style="margin:6px 0"><input type="radio" name="bs" value="${k}"${i === 0 ? ' checked' : ''}> ${esc(l)} <span class="badge">${a.length}</span></label>`).join('')}
  <ol class="steps small" style="margin-top:14px"><li>Download the file(s) below.</li><li>Open Lenovo’s batch page, upload the file and press Submit.</li><li>On the results page choose <b>Export Results</b> and save the file.</li><li>Back here: <b>Import → Warranty dates</b>, drop the exported file.</li></ol>`;
  const build = () => {
    const k = $('input[name=bs]:checked', body).value, devs = [...new Map(sets.find(x => x[0] === k)[2].map(d => [d.serial.trim().toUpperCase(), d])).values()];
    if (!devs.length) return toast('No Lenovo devices with serial numbers match that choice.', 'err');
    const n = Math.ceil(devs.length / 1000);
    for (let i = 0; i < n; i++) {
      const chunk = devs.slice(i * 1000, (i + 1) * 1000);
      downloadBlob(`lenovo-batch-${i + 1}-of-${n}.xlsx`, writeXlsx([['Machine Type', 'SerialorIMEI'], ...chunk.map(d => [lenovoMachineType(d), d.serial.trim().toUpperCase()])], 'Sheet1'));
    }
    DB.log(`Built Lenovo batch warranty file(s) for ${devs.length} serials`); toast(`${devs.length} serials in ${n} file(s)`);
  };
  modal({ title: 'Lenovo warranty – batch file', body, buttons: [{ label: 'Close' }, { label: 'Open Lenovo batch page ↗', onClick: () => { window.open(LENOVO_BATCH_URL, '_blank', 'noopener'); return false; } }, { label: 'Download file(s)', cls: 'primary', onClick: () => { build(); return false; } }] });
}

// ---- Settings card ----
const lenovoCardHTML = () => `<div class="card"><div class="card-h"><h3>Lenovo warranty</h3></div>
  <p class="small muted"><b>No key needed:</b> build the upload file for Lenovo’s public Batch Warranty Lookup, upload it there, export the results, and import them on <i>Import → Warranty dates</i>. Lenovo allows 1,000 serials per upload.</p>
  <div class="chips" style="margin-bottom:12px"><button class="btn primary sm" id="lw-batch">Build batch upload file…</button><a class="btn sm" target="_blank" rel="noopener" href="${LENOVO_BATCH_URL}">Open Lenovo batch page ↗</a><a class="btn sm" href="#/import" onclick="UI.impTab='warranty'">Import results</a></div>
  <details><summary class="small muted" style="cursor:pointer">Optional: Lenovo API key (if you ever get one)</summary>
  <p class="small muted">The key is kept only in this browser. Browsers may block the call; the batch route above is more dependable.</p>
  <div class="form-grid"><div class="field wide"><label>Lenovo ClientID</label><input id="lw-key" type="password" autocomplete="off" value="${esc(lenovoKey())}" placeholder="paste the ClientID from Lenovo"></div>
  <div class="field"><label>Test with a serial number</label><input id="lw-test" placeholder="e.g. PF1ABCDE"></div><div class="field"><label>&nbsp;</label><span><button class="btn" id="lw-go">Test lookup</button></span></div></div>
  <div id="lw-res" class="small" style="margin:8px 0"></div><div class="chips"><button class="btn sm" id="lw-save">Save key</button><button class="btn sm" id="lw-ser">Download serial list (CSV)</button></div></details></div>`;
function bindLenovoCard(root) {
  $('#lw-batch', root).onclick = () => lenovoBatchDialog();
  $('#lw-save', root).onclick = () => { try { localStorage.setItem('lt-lenovo-key', $('#lw-key', root).value.trim()); toast('Key saved in this browser'); } catch { toast('Could not save', 'err'); } };
  $('#lw-ser', root).onclick = () => download('lenovo-serials.csv', lenovoSerialsCSV());
  $('#lw-go', root).onclick = async () => {
    try { localStorage.setItem('lt-lenovo-key', $('#lw-key', root).value.trim()); } catch { }
    const sn = $('#lw-test', root).value.trim(), out = $('#lw-res', root); if (!sn) return;
    out.textContent = 'Looking up…';
    try { const w = await lenovoLookup(sn); out.innerHTML = `<span class="badge ok">OK</span> Warranty ends <b>${fmtDate(w.end)}</b>${w.start ? ', started ' + fmtDate(w.start) : ''}${w.product ? ' — ' + esc(w.product) : ''}`; }
    catch (e) { out.innerHTML = `<span class="badge bad">Failed</span> ${esc(e.message)}`; }
  };
}

// ---- Import: warranty results (Lenovo "Export Results" .xlsx/.csv, pasted table text, or any export with serial + end date) ----
const WARRANTY_FIELDS = [
  { k: 'serial', label: 'Serial number', req: true, alias: ['serialorimei', 'serial', 'serialnumber', 'serialno', 'imei', 'sn'] },
  { k: 'end', label: 'Warranty end date', req: true, alias: ['warrantyenddate', 'enddate', 'end', 'expirationdate', 'expiration', 'warrantyexpirationdate', 'warrantyend', 'expirydate', 'expires', 'warrantyexpiry', 'coverageenddate', 'coverageend', 'applecareenddate', 'agreementenddate', 'coverageexpiration', 'coverageexpires'] },
  { k: 'start', label: 'Warranty start date', alias: ['warrantystartdate', 'startdate', 'start', 'warrantystart', 'coveragestartdate', 'coveragestart'] },
  { k: 'product', label: 'Warranty / service level', alias: ['warrantyname', 'servicelevel', 'warrantydescription', 'warrantytype', 'servicetype', 'coveragetype', 'coveragedescription', 'agreementdescription', 'product', 'description', 'name'] }];
function tableFromRows(rows) {
  let h = rows.findIndex(r => r.some(c => /serial|imei/i.test(String(c)))); if (h < 0) h = 0;
  const headers = (rows[h] || []).map(x => String(x).trim());
  return { headers, rows: rows.slice(h + 1).map(r => Object.fromEntries(headers.map((x, i) => [x, String(r[i] ?? '').trim()]))) };
}
const warDate = v => { v = String(v || '').trim(); if (/^\d{5}(\.\d+)?$/.test(v) && +v > 30000 && +v < 80000) return ymd(new Date(1899, 11, 30 + Math.floor(+v), 12)); return normDate(v); };
function warrantyImport(host) {
  const I = UI.impWar ??= {};
  const rows = () => buildWarrantyRows(I.parsed, I.map);
  const load = t => { I.parsed = tableFromRows(t); I.map = autoMap(I.parsed.headers, WARRANTY_FIELDS); if (!I.map.end) { const h = I.parsed.headers.find(x => /end|expir/i.test(x)); if (h) I.map.end = h; } if (!I.map.serial) toast('Couldn’t find a serial column – check the mapping.', 'err'); draw(); };
  const draw = () => {
    const rs = I.parsed ? rows() : [], ok = rs.filter(r => r.d && r.end);
    host.innerHTML = `<div class="card"><p class="small muted">Import warranty end dates by serial number. For Lenovo without an API key: <b>Settings → Build batch upload file</b>, upload it on Lenovo’s batch page, press <b>Export Results</b>, then drop that file here (.xlsx or .csv). You can also paste the results table text. Any export with a serial and an end date works – including Apple School/Business Manager coverage exports.</p>
    <p class="chips"><button class="btn sm" id="ba">Apple coverage tools…</button><button class="btn sm primary" id="bb">Build Lenovo batch upload file…</button><a class="btn sm" target="_blank" rel="noopener" href="${LENOVO_BATCH_URL}">Open Lenovo batch page ↗</a></p>
    <div class="drop" id="drop"><p><b>Drop the exported results file here</b> or <label style="color:var(--accent);cursor:pointer;text-decoration:underline">choose a file<input type="file" id="file" accept=".xlsx,.csv,.txt,.tsv" hidden></label></p><p class="small">.xlsx and .csv are read in your browser – nothing is uploaded anywhere.</p></div>
    <details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">…or paste the results table</summary><textarea id="paste" rows="5" style="width:100%;margin-top:6px" placeholder="Paste rows copied from the results page (with the header row)"></textarea><p><button class="btn sm" id="pp">Read pasted text</button></p></details>
    ${I.parsed ? `<h3 style="margin-top:16px">${esc(I.fileName || 'Pasted text')} – ${rs.length} serial numbers</h3>${mappingHTML(I.parsed.headers, WARRANTY_FIELDS, I.map)}
    <div class="chips" style="margin:10px 0"><span class="badge ok">${ok.length} matched with an end date</span><span class="badge ${rs.some(r => !r.d) ? 'warn' : ''}">${rs.filter(r => !r.d).length} not in the tracker</span><span class="badge ${rs.some(r => !r.end) ? 'warn' : ''}">${rs.filter(r => !r.end).length} without a date (Lenovo found nothing)</span></div>
    <div class="tbl-wrap" style="max-height:260px"><table><thead><tr><th>Serial</th><th>Device</th><th>Warranty start</th><th>Warranty ends</th><th>Service</th></tr></thead><tbody>${rs.slice(0, 80).map(r => `<tr><td>${esc(r.serial)}</td><td>${r.d ? esc(r.d.name) : '<span class="badge warn">not found</span>'}</td><td>${r.start ? fmtDate(r.start) : '—'}</td><td>${r.end ? fmtDate(r.end) : '—'}</td><td class="small">${esc(r.product)}</td></tr>`).join('')}</tbody></table></div>
    <p><button class="btn primary edit-only" id="apply"${ok.length ? '' : ' disabled'}>Update ${ok.length} devices</button></p>` : ''}</div>`;
    $('#bb', host).onclick = () => lenovoBatchDialog(); $('#ba', host).onclick = () => appleCoverageDialog();
    const drop = $('#drop', host), inp = $('#file', host);
    const go = async f => {
      if (!f) return; I.fileName = f.name;
      try {
        if (/\.xls$/i.test(f.name)) throw new Error('Old .xls files can’t be read – re-save as .xlsx or CSV.');
        load(/\.xlsx$/i.test(f.name) ? await readXlsx(await f.arrayBuffer()) : parseCSV(await readFileText(f)));
      } catch (e) { toast(e.message, 'err'); }
    };
    inp.onchange = () => go(inp.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over'); drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); go(e.dataTransfer.files[0]); };
    $('#pp', host).onclick = () => { const t = $('#paste', host).value; if (t.trim()) { I.fileName = ''; load(parseCSV(t)); } };
    host.onchange = e => { if (e.target.dataset.map !== undefined) { I.map[e.target.dataset.map] = e.target.value; draw(); } };
    const ap = $('#apply', host);
    if (ap) ap.onclick = () => { ok.forEach(r => saveWarranty(r.d, r, I.fileName ? 'Lenovo batch export' : 'Imported')); DB.log(`Imported warranty dates for ${ok.length} devices`); toast(`Updated ${ok.length} devices`); UI.impWar = {}; UI.repTab = 'expiring'; location.hash = '#/reports'; };
  };
  draw();
}
