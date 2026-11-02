// Analysis reports: TCO per model, right-sizing, usage trends, data quality, disposal & redeployment, calendar (.ics) export.
function tcoReport(host) {
  const rows = DB.data.models.map(m => {
    const devs = DB.data.devices.filter(d => (d.model || '').toLowerCase() === m.name.toLowerCase()), n = devs.length, lines = DB.data.hardware.filter(l => l.modelId === m.id), qty = sum(lines, l => +l.qty || 0) || n;
    const reps = DB.data.maintenances.filter(x => devs.some(d => d.id === x.deviceId)), repairs = reps.filter(x => x.type === 'Repair'), yrs = lines.length ? sum(lines, l => ageBase(l) ? yearsBetween(ageBase(l), todayStr()) * (+l.qty || 0) : 0) / (qty || 1) : 0;
    const cost = sum(reps, x => +x.cost || 0);
    return { m, qty, n, repairs: repairs.length, cost, rate: qty && yrs ? repairs.length / qty / yrs : 0, tco: (+m.unitCost || 0) + (n ? cost / n : 0) };
  }).filter(r => r.qty || r.n);
  host.innerHTML = `<p class="muted small">Purchase price plus logged maintenance cost per managed device. Failure rate = repair jobs per device per year in service. Log repairs against a device on its page so they count here.</p><div class="tbl-wrap"><table><thead><tr><th>Model</th><th class="num">Devices</th><th class="num">Unit cost</th><th class="num">Repairs</th><th class="num">Repair cost</th><th class="num">Failures / device / yr</th><th class="num">TCO per device</th></tr></thead><tbody>${rows.sort((a, b) => b.tco - a.tco).map(r => `<tr><td>${esc(r.m.name)}</td><td class="num">${r.qty}</td><td class="num">${money(r.m.unitCost)}</td><td class="num">${r.repairs}</td><td class="num">${money(r.cost)}</td><td class="num">${r.rate ? r.rate.toFixed(2) : '—'}</td><td class="num"><b>${money(r.tco)}</b></td></tr>`).join('')}</tbody></table></div>`;
}
function rightSizeReport(host) {
  const target = S().targetUtil || 70;
  const rows = DB.data.labs.filter(l => l.usage?.util != null && +l.seats > 0).map(lab => {
    const need = Math.max(1, Math.ceil(lab.seats * lab.usage.util / target)), surplus = Math.max(0, lab.seats - need), unit = labStats(lab).qty ? labStats(lab).cost / labStats(lab).qty : 0;
    return { lab, need, surplus, save: surplus * unit };
  }).sort((a, b) => b.surplus - a.surplus);
  host.innerHTML = `<p class="muted small">Suggested seats = seats × utilization ÷ target (${target}%, change in Settings). LabStats utilization is an <b>average</b>, so check peak concurrency before cutting seats; the savings figure is the avoided replacement cost at the lab’s average unit price.</p><div class="kpis">${tile('', 'dollar', 'good', money(sum(rows, r => r.save)), 'Potential avoided cost', `${sum(rows, r => r.surplus)} surplus seats`)}</div>
  <div class="tbl-wrap"><table><thead><tr><th>Lab</th><th class="num">Seats</th><th class="num">Utilization</th><th class="num">Suggested seats</th><th class="num">Surplus</th><th class="num">Avoided cost</th></tr></thead><tbody>${rows.map(r => `<tr><td><a href="#/lab/${r.lab.id}">${esc(labLabel(r.lab))}</a></td><td class="num">${r.lab.seats}</td><td class="num">${utilBadge(r.lab)}</td><td class="num">${r.need}</td><td class="num">${r.surplus ? `<span class="badge warn">${r.surplus}</span>` : '—'}</td><td class="num">${r.save ? money(r.save) : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Import LabStats usage and set seats on labs first.</td></tr>'}</tbody></table></div>`;
}
function trendsReport(host) {
  const labs = DB.data.labs.filter(l => (l.usageHistory || []).length), periods = [...new Map(labs.flatMap(l => l.usageHistory).sort((a, b) => cmp(a.importedAt, b.importedAt)).map(h => [h.period, h.importedAt])).keys()];
  host.innerHTML = `<p class="muted small">Each LabStats usage import is kept as a snapshot, so utilization can be tracked over time. Import a report per term or month.</p><div class="card"><div id="tr-chart"></div></div>`;
  const top = labs.sort((a, b) => (b.usage?.util || 0) - (a.usage?.util || 0)).slice(0, 8);
  if (!periods.length) { $('#tr-chart', host).innerHTML = '<div class="empty">No usage history yet. Import LabStats usage at least twice with different period names.</div>'; return; }
  renderChart($('#tr-chart', host), { type: 'line', labels: periods, series: top.map(l => ({ name: labLabel(l), values: periods.map(p => l.usageHistory.find(h => h.period === p)?.util ?? 0) })), money: false, title: 'Utilization % by period' });
}
function qualityChecks() {
  const d = DB.data, dup = (arr, f) => { const m = group(arr.filter(x => f(x)), f); return [...m].filter(([, v]) => v.length > 1).flatMap(([, v]) => v); };
  const lab = id => labLabel(DB.get('labs', id));
  return [
    ['Devices sharing a serial number', dup(d.devices, x => x.serial?.toUpperCase()), x => `${x.name} (${x.serial})`, '#/devices'],
    ['Devices sharing an asset tag', dup(d.devices, x => x.assetTag), x => `${x.name} (${x.assetTag})`, '#/devices'],
    ['Devices checked out to a closed lab', d.devices.filter(x => DB.get('labs', x.labId)?.status === 'Closed'), x => `${x.name} → ${lab(x.labId)}`, '#/devices'],
    ['Hardware lines with no purchase / replaced date', d.hardware.filter(l => isActiveLine(l) && !ageBase(l) && !l.plannedOverride), l => `${modelName(l)} @ ${lab(l.labId)}`, '#/hardware'],
    ['Hardware lines without a unit cost', d.hardware.filter(l => isActiveLine(l) && !unitCostOf(l)), l => `${modelName(l)} @ ${lab(l.labId)}`, '#/hardware'],
    ['Hardware quantity differs >10% from managed devices', d.labs.filter(l => { const s = labStats(l); return s.managed && s.qty && Math.abs(s.managed - s.qty) / s.qty > 0.1; }), l => `${labLabel(l)}: ${labStats(l).qty} in inventory vs ${labStats(l).managed} managed`, '#/labs'],
    ['Physical count differs from inventory quantity', d.hardware.filter(l => isActiveLine(l) && l.physicalCount != null && l.physicalCount !== '' && +l.physicalCount !== +l.qty), l => `${modelName(l)} @ ${lab(l.labId)}: ${l.qty} recorded, ${l.physicalCount} counted`, '#/hardware'],
    ['LabStats station count differs from managed devices', d.labs.filter(l => +l.labStatsCount && labStats(l).managed && +l.labStatsCount !== labStats(l).managed), l => `${labLabel(l)}: ${l.labStatsCount} in LabStats vs ${labStats(l).managed} managed`, '#/labs'],
    ['Labs with devices but no hardware lines', d.labs.filter(l => labStats(l).managed && !labStats(l).lines.length), l => labLabel(l), '#/labs'],
    ['Labs with no contacts anywhere', d.labs.filter(l => !contactsForLab(l).length), l => labLabel(l), '#/contacts'],
    ['Contacts without an email address', d.contacts.filter(c => !c.email), c => c.name, '#/contacts'],
    ['Models without specs (RAM / storage)', d.models.filter(m => !(m.ramGB && m.storageGB)), m => m.name, '#/models'],
    ['Subscriptions with no expiry date', d.software.filter(s => s.licenseType === 'Subscription' && !s.licenseExpiry), s => s.name, '#/software'],
    ['Devices with no serial number', d.devices.filter(x => !x.serial), x => x.name, '#/devices']
  ];
}
function qualityReport(host) {
  host.innerHTML = qualityChecks().map(([t, list, f, href]) => `<div class="card" style="padding:10px 16px"><div class="card-h" style="margin:0"><span class="badge ${list.length ? 'warn' : 'ok'}">${list.length}</span><b>${esc(t)}</b><span class="spacer"></span><a href="${href}">Open →</a></div>${list.length ? `<div class="small muted" style="margin-top:6px">${list.slice(0, 8).map(x => esc(f(x))).join(' · ')}${list.length > 8 ? ` · … +${list.length - 8} more` : ''}</div>` : ''}</div>`).join('');
}
// ---- disposal & redeployment ----
const DISPOSAL_METHODS = ['Surplus / auction', 'Recycled (e-waste)', 'Trade-in', 'Donated', 'Destroyed', 'Returned to vendor'], SANITIZE = ['Drive wiped', 'Drive destroyed', 'Reimaged only', 'Not applicable'];
function disposeDialog(ids, done) {
  const body = document.createElement('div'), F = [{ k: 'date', label: 'Disposal date', type: 'date', req: true }, { k: 'method', label: 'Method', type: 'select', req: true, options: DISPOSAL_METHODS }, { k: 'sanitization', label: 'Data sanitization', type: 'select', req: true, options: SANITIZE }, { k: 'cert', label: 'Certificate / pickup reference' }, { k: 'notes', label: 'Notes', type: 'textarea', wide: true }];
  body.className = 'form-grid'; body.innerHTML = F.map(f => fieldHTML(f, { date: todayStr() }[f.k])).join('');
  modal({ title: `Retire / dispose ${ids.length} device(s)`, body, buttons: [{ label: 'Cancel' }, { label: 'Retire', cls: 'primary', onClick: () => {
    const o = readFields(body, F); if (!o.date || !o.method || !o.sanitization) { toast('Date, method and sanitization are required.', 'err'); return false; }
    ids.forEach(id => { const d = DB.get('devices', id); if (d) DB.put('devices', { ...d, status: 'Archived', labId: '', labLocked: true, disposal: { ...o, by: DB.user } }); });
    DB.log(`Retired ${ids.length} device(s) (${o.method})`); done?.(); toast('Retired'); render();
  } }] });
}
function surplusReport(host) {
  const disposed = DB.data.devices.filter(d => d.disposal), ready = DB.data.devices.filter(d => !d.labId && devStatus(d) === 'Ready to deploy');
  const needs = PLATFORMS.map(p => [p, DB.data.hardware.filter(l => isActiveLine(l) && platformOf(l) === p && lineState(l) === 'Overdue').length]);
  host.innerHTML = `<div class="card"><div class="card-h"><h3>Redeployment candidates</h3></div><p class="small muted">Devices that are “Ready to deploy” (not in a lab). Labs with overdue hardware that could use them: ${needs.map(([p, n]) => `<b>${p}</b> ${n} line(s)`).join(' · ')}.</p>${ready.length ? `<table><thead><tr><th>Device</th><th>Model</th><th>Platform</th><th>Purchased</th></tr></thead><tbody>${ready.slice(0, 100).map(d => `<tr><td><a href="#/device/${d.id}">${esc(d.name)}</a></td><td>${esc(d.model || '')}</td><td>${esc(d.platform || '')}</td><td>${fmtDate(d.purchaseDate)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">None.</div>'}</div>
  <div class="card"><div class="card-h"><h3>Disposal records</h3></div>${disposed.length ? `<div class="tbl-wrap"><table><thead><tr><th>Device</th><th>Serial</th><th>Date</th><th>Method</th><th>Data sanitization</th><th>Reference</th><th>By</th></tr></thead><tbody>${disposed.sort((a, b) => cmp(b.disposal.date, a.disposal.date)).map(d => `<tr><td><a href="#/device/${d.id}">${esc(d.name)}</a></td><td>${esc(d.serial || '')}</td><td>${fmtDate(d.disposal.date)}</td><td>${esc(d.disposal.method)}</td><td>${esc(d.disposal.sanitization)}</td><td>${esc(d.disposal.cert || '')}</td><td>${esc(d.disposal.by || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No devices retired yet. Use “Retire / dispose…” on a device or in bulk on the Devices page.</div>'}</div>`;
}
// ---- calendar export ----
function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
const nextDay = s => { const x = parseD(s); x.setDate(x.getDate() + 1); return ymd(x); };
function buildICS(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', d8 = s => s.replace(/-/g, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lab Asset Tracker//EN', 'CALSCALE:GREGORIAN',
    ...events.flatMap((e, i) => ['BEGIN:VEVENT', `UID:lt-${i}-${d8(e.date)}-${e.uid || i}@lab-tracker`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(nextDay(e.date))}`, `SUMMARY:${icsEscape(e.title)}`, e.desc ? `DESCRIPTION:${icsEscape(e.desc)}` : '', 'END:VEVENT'].filter(Boolean)),
    'END:VCALENDAR'].join('\r\n');
}
function calendarReport(host) {
  const C = UI.cal ??= { rep: true, lic: true, war: true, proj: true, black: true };
  host.innerHTML = `<p class="muted small">Exports an <b>.ics</b> file that Outlook, Google Calendar or Apple Calendar can import (or subscribe to by saving it on the share). It is a snapshot – re-export after the plan changes.</p>
  <div class="card">${[['rep', 'Planned replacement dates (per lab)'], ['lic', 'Software license expirations'], ['war', 'Warranty ends (grouped per lab and month)'], ['proj', 'Project install windows'], ['black', 'Blackout windows']].map(([k, l]) => `<label class="chk" style="margin:6px 0"><input type="checkbox" data-c="${k}"${C[k] ? ' checked' : ''}> ${l}</label>`).join('')}<p><button class="btn primary" id="ics">${ic('download')} Download .ics</button></p></div>`;
  host.onchange = e => { if (e.target.dataset.c) C[e.target.dataset.c] = e.target.checked; };
  $('#ics', host).onclick = () => {
    const ev = [], t = todayStr();
    if (C.rep) DB.data.labs.forEach(lab => { const s = labStats(lab); if (s.next) ev.push({ date: s.next < t ? t : s.next, title: `Replacement due: ${labLabel(lab)}`, desc: `${s.qty} devices, ${money(s.cost)} estimated${s.next < t ? ' (overdue since ' + s.next + ')' : ''}`, uid: lab.id }); });
    if (C.lic) DB.data.software.filter(s => s.licenseExpiry).forEach(s => ev.push({ date: s.licenseExpiry, title: `License expires: ${s.name}`, desc: s.vendor || '', uid: s.id }));
    if (C.war) { const g = group(DB.data.devices.filter(d => d.warrantyEnd && d.warrantyEnd >= t), d => (d.labId || 'none') + '|' + d.warrantyEnd.slice(0, 7)); g.forEach((ds, k) => ev.push({ date: ds.map(d => d.warrantyEnd).sort()[0], title: `Warranty ends: ${ds.length} device(s) ${ds[0].labId ? 'in ' + labLabel(DB.get('labs', ds[0].labId)) : '(not in a lab)'}`, desc: ds.slice(0, 15).map(d => d.name).join(', '), uid: k })); }
    if (C.proj) DB.data.projects.filter(p => p.installStart).forEach(p => ev.push({ date: p.installStart, title: `Install starts: ${p.title}`, desc: `Status: ${p.status}`, uid: p.id }));
    if (C.black) (S().blackouts || []).forEach((b, i) => ev.push({ date: b.start, title: `Blackout starts: ${b.label}`, desc: `Through ${b.end}`, uid: 'b' + i }));
    if (!ev.length) return toast('Nothing to export for those choices.', 'err');
    download('lab-tracker.ics', buildICS(ev), 'text/calendar'); toast(`${ev.length} events exported`);
  };
}
