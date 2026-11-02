// Barcode (Code 128) asset-tag labels and scan-based lab audits.
const C128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232"];
const C128_STOP = '2331112';
function code128SVG(text, { h = 38, mod = 1.6 } = {}) {
  const vals = [104]; let chk = 104, pos = 0;
  for (const ch of String(text)) { const v = ch.charCodeAt(0) - 32; if (v < 0 || v > 95) continue; vals.push(v); chk += v * ++pos; }
  vals.push(chk % 103); let x = 10 * mod, bars = '';
  [...vals.map(v => C128[v]), C128_STOP].forEach(p => { for (let i = 0; i < p.length; i++) { const w = +p[i] * mod; if (i % 2 === 0) bars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${h}"/>`; x += w; } });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(x + 10 * mod).toFixed(1)} ${h}" preserveAspectRatio="none" style="width:100%;height:${h * 0.6}px" fill="#000">${bars}</svg>`;
}
const LABEL_SIZES = { small: { name: 'Small – 2⅝″ × 1″ (30 per sheet, Avery 5160)', w: '2.625in', h: '1in', cols: 3, pad: '0.5in 0.19in' }, large: { name: 'Large – 4″ × 2″ (10 per sheet, Avery 5163)', w: '4in', h: '2in', cols: 2, pad: '0.5in 0.16in' } };
function labelsHTML(devs, size) {
  const z = LABEL_SIZES[size], org = S().orgName || '';
  return `<style>@page{margin:0}body{margin:0;font-family:Arial,sans-serif}.sheet{display:grid;grid-template-columns:repeat(${z.cols},${z.w});padding:${z.pad};column-gap:${size === 'small' ? '0.125in' : '0.18in'}}.lb{width:${z.w};height:${z.h};box-sizing:border-box;padding:0.07in 0.1in;overflow:hidden;font-size:${size === 'small' ? '8px' : '11px'};line-height:1.2}.lb b{font-size:${size === 'small' ? '11px' : '16px'}}.o{color:#555}</style>
  <div class="sheet">${devs.map(d => { const code = d.assetTag || d.serial; return `<div class="lb"><div class="o">${esc(org)}</div><b>${esc(d.assetTag || d.serial)}</b>${code ? code128SVG(code, { h: size === 'small' ? 30 : 46 }) : ''}<div>${esc(d.name)}${d.labId ? ' · ' + esc(labLabel(DB.get('labs', d.labId))) : ''}</div></div>`; }).join('')}</div>`;
}
function printHTMLWindow(title, html) { const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print.', 'err'); w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>${html}</body></html>`); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }

SCHEMA.audit = { title: 'Audit', table: 'audits', fields: [{ k: 'notes', label: 'Notes', type: 'textarea', wide: true }] };
VIEWS.audit = {
  render(el) {
    const tab = UI.auditTab || 'audit';
    el.innerHTML = pageHead('Labels & audits') + `<div class="tabs"><a data-tab="audit" class="${tab === 'audit' ? 'on' : ''}">Audit a lab</a><a data-tab="labels" class="${tab === 'labels' ? 'on' : ''}">Print labels</a><a data-tab="history" class="${tab === 'history' ? 'on' : ''}">Audit history</a></div><div id="t"></div>`;
    el.onclick = e => { const t = e.target.closest('[data-tab]'); if (t) { UI.auditTab = t.dataset.tab; render(); } };
    ({ audit: auditTab, labels: labelsTab, history: auditHistory })[tab]($('#t', el));
  }
};
function labelsTab(host) {
  const L = UI.lbl ??= { lab: '', size: 'small', scope: 'notag' };
  const pool = () => DB.data.devices.filter(d => (d.assetTag || d.serial) && (!L.lab || d.labId === L.lab) && (L.scope === 'all' || (L.scope === 'notag' ? !d.labelPrinted : !!d.assetTag)));
  host.innerHTML = `<p class="muted small">Prints Code 128 barcode labels (scannable by any USB or phone barcode scanner). The barcode encodes the asset tag, or the serial number if the device has no tag yet – use “Generate asset tags” on the Devices page first.</p>
  <div class="card"><div class="toolbar"><div class="field"><label>Lab</label><select id="lb-lab"><option value="">All labs</option>${optionsHTML(labOptions(), L.lab)}</select></div>
  <div class="field"><label>Which devices</label><select id="lb-scope">${optionsHTML([{ v: 'notag', l: 'Not yet printed' }, { v: 'tagged', l: 'Only devices with an asset tag' }, { v: 'all', l: 'All' }], L.scope)}</select></div>
  <div class="field"><label>Label size</label><select id="lb-size">${optionsHTML(Object.entries(LABEL_SIZES).map(([v, z]) => ({ v, l: z.name })), L.size)}</select></div></div>
  <p><b id="lb-n">${pool().length}</b> label(s) <button class="btn primary" id="lb-print">Print / Save PDF</button> <span class="small muted">Marks them as printed so the next run skips them.</span></p></div>
  <div class="card"><div class="card-h"><h3>Preview (first 12)</h3></div><div style="background:#fff;color:#000;padding:8px;overflow:auto">${labelsHTML(pool().slice(0, 12), L.size)}</div></div>`;
  host.onchange = e => { const id = e.target.id; if (id === 'lb-lab') L.lab = e.target.value; else if (id === 'lb-scope') L.scope = e.target.value; else if (id === 'lb-size') L.size = e.target.value; else return; labelsTab(host); };
  $('#lb-print', host).onclick = () => { const ds = pool(); if (!ds.length) return toast('Nothing to print.', 'err'); printHTMLWindow('Labels', labelsHTML(ds, L.size)); ds.forEach(d => DB.put('devices', { ...d, labelPrinted: todayStr() })); DB.log(`Printed ${ds.length} labels`); };
}
function auditTab(host) {
  const A = UI.auditSess ??= { labId: '', found: new Set(), extra: [], unknown: [] };
  const lab = DB.get('labs', A.labId), exp = lab ? (devicesByLab().get(lab.id) || []).filter(d => devStatus(d) !== 'Archived') : [];
  host.innerHTML = `<p class="muted small">Pick a lab, then scan each device’s barcode (or type the tag / serial and press Enter). Anything not scanned is reported missing; devices that belong elsewhere are flagged. Nothing is changed until you finish the audit.</p>
  <div class="card"><div class="toolbar"><div class="field"><label>Lab being audited</label><select id="au-lab"><option value="">— choose —</option>${optionsHTML(labOptions(), A.labId)}</select></div>
  ${lab ? `<div class="field" style="flex:1;min-width:240px"><label>Scan or type tag / serial / name</label><input id="au-in" autocomplete="off" style="font-size:18px" placeholder="…then press Enter"></div>` : ''}</div>
  ${lab ? `<div class="kpis"><div class="kpi"><span><div class="v">${A.found.size}/${exp.length}</div><div class="l">Found / expected</div></span></div><div class="kpi"><span><div class="v">${A.extra.length}</div><div class="l">Belong elsewhere</div></span></div><div class="kpi"><span><div class="v">${A.unknown.length}</div><div class="l">Unrecognised</div></span></div></div>
  <div class="grid g2"><div><h3>Still to find (${exp.length - [...A.found].filter(id => exp.some(d => d.id === id)).length})</h3><div class="small" style="max-height:260px;overflow:auto">${exp.filter(d => !A.found.has(d.id)).map(d => `<div>${esc(d.name)} <span class="muted">${esc(d.assetTag || d.serial || '')}</span></div>`).join('') || '<span class="badge ok">All found</span>'}</div></div>
  <div><h3>Scanned</h3><div class="small" style="max-height:260px;overflow:auto">${[...A.found].map(id => DB.get('devices', id)).filter(Boolean).map(d => `<div>✓ ${esc(d.name)}</div>`).join('')}${A.extra.map(x => `<div style="color:var(--warn)">⚠ ${esc(x.d.name)} belongs to ${esc(labLabel(DB.get('labs', x.d.labId)) || 'no lab')} <button class="btn sm edit-only" data-move="${x.d.id}">Move here</button></div>`).join('')}${A.unknown.map(u => `<div style="color:var(--danger)">? ${esc(u)} not in the tracker</div>`).join('')}</div></div></div>
  <p style="margin-top:12px"><button class="btn primary edit-only" id="au-fin">Finish &amp; save audit</button> <button class="btn" id="au-reset">Start over</button></p>` : ''}</div>`;
  const inp = $('#au-in', host); if (inp) inp.focus();
  host.onchange = e => { if (e.target.id === 'au-lab') { UI.auditSess = { labId: e.target.value, found: new Set(), extra: [], unknown: [] }; auditTab(host); } };
  if (inp) inp.onkeydown = e => {
    if (e.key !== 'Enter') return; const code = inp.value.trim().toLowerCase(); if (!code) return;
    const d = DB.data.devices.find(x => [x.assetTag, x.serial, x.name].some(v => v && v.toLowerCase() === code));
    if (!d) A.unknown.push(inp.value.trim()); else if (d.labId === lab.id) A.found.add(d.id); else if (!A.extra.some(x => x.d.id === d.id)) A.extra.push({ d }); auditTab(host);
  };
  host.onclick = e => {
    const mv = e.target.closest('[data-move]'); if (mv) { const d = DB.get('devices', mv.dataset.move); DB.put('devices', { ...d, labId: lab.id, labLocked: true }); A.extra = A.extra.filter(x => x.d.id !== d.id); A.found.add(d.id); DB.log(`Moved ${d.name} into ${labLabel(lab)} during audit`); return auditTab(host); }
    if (e.target.closest('#au-reset')) { UI.auditSess = { labId: A.labId, found: new Set(), extra: [], unknown: [] }; return auditTab(host); }
    if (e.target.closest('#au-fin')) {
      const missing = exp.filter(d => !A.found.has(d.id));
      if (!confirm(`Save this audit? ${A.found.size} found, ${missing.length} missing.`)) return;
      DB.put('audits', { labId: lab.id, date: todayStr(), by: DB.user, expected: exp.length, found: [...A.found].filter(id => exp.some(d => d.id === id)).length, missing: missing.map(d => d.name), extra: A.extra.map(x => x.d.name), unknown: A.unknown });
      [...A.found].forEach(id => { const d = DB.get('devices', id); if (d) DB.put('devices', { ...d, lastAudited: todayStr() }); });
      DB.log(`Audited ${labLabel(lab)}: ${A.found.size} found, ${missing.length} missing`); UI.auditSess = null; UI.auditTab = 'history'; toast('Audit saved'); render();
    }
  };
}
function auditHistory(host) {
  const rows = DB.data.audits.slice().sort((a, b) => cmp(b.date, a.date));
  host.innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Lab</th><th>By</th><th class="num">Expected</th><th class="num">Found</th><th>Missing</th><th>Elsewhere / unknown</th></tr></thead><tbody>${rows.map(a => `<tr><td>${fmtDate(a.date)}</td><td>${esc(labLabel(DB.get('labs', a.labId)))}</td><td>${esc(a.by)}</td><td class="num">${a.expected}</td><td class="num">${a.found}</td><td class="small">${a.missing.length ? `<span class="badge bad">${a.missing.length}</span> ${esc(a.missing.slice(0, 6).join(', '))}${a.missing.length > 6 ? '…' : ''}` : '<span class="badge ok">none</span>'}</td><td class="small">${esc([...(a.extra || []), ...(a.unknown || [])].slice(0, 6).join(', '))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No audits saved yet.</div>';
}
