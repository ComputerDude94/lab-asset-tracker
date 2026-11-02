// Software extras: installed-app drift, confirmation tracking, baselines, license compliance.
const APP_FIELDS = [
  { k: 'device', label: 'Device name', req: true, alias: ['devicename', 'computername', 'device', 'hostname', 'machinename', 'machine'] },
  { k: 'app', label: 'Application', req: true, alias: ['appname', 'applicationname', 'displayname', 'softwarename', 'application', 'app', 'software', 'name'] },
  { k: 'version', label: 'Version', alias: ['version', 'appversion', 'installedversion', 'applicationversion'] }];
const appKey = s => String(s || '').toLowerCase().replace(/\(.*?\)|\b(x64|x86|64-bit|32-bit|for windows|for mac|inc\.?|corporation)\b/g, '').replace(/[^a-z0-9]/g, '');
const appMatch = (expected, seen) => { const a = appKey(expected), b = appKey(seen); return a.length >= 4 && b.length >= 4 && (a === b || a.includes(b) || b.includes(a)); };
function applyInstalledApps(rows, name) {
  const t = tableFromRows(rows), map = autoMap(t.headers, APP_FIELDS);
  if (!map.device || !map.app) throw new Error('Could not find device-name and application columns.');
  const byName = new Map(DB.data.devices.map(d => [(d.name || '').toLowerCase(), d])), agg = new Map(), devSeen = new Map();
  t.rows.forEach(r => {
    const d = byName.get((r[map.device] || '').toLowerCase()); if (!d?.labId) return;
    const key = d.labId + '|' + (r[map.app] || ''), e = agg.get(key) || { labId: d.labId, n: r[map.app], versions: new Map(), c: 0 };
    e.c++; const v = r[map.version] || ''; e.versions.set(v, (e.versions.get(v) || 0) + 1); agg.set(key, e);
    (devSeen.get(d.labId) || devSeen.set(d.labId, new Set()).get(d.labId)).add(d.id);
  });
  const perLab = group([...agg.values()], e => e.labId); let labsN = 0;
  perLab.forEach((es, labId) => {
    const lab = DB.get('labs', labId), n = devSeen.get(labId).size;
    const top = es.sort((a, b) => b.c - a.c).slice(0, 250).map(e => ({ n: e.n, v: [...e.versions.entries()].sort((a, b) => b[1] - a[1])[0][0], c: e.c }));
    DB.put('labs', { ...lab, appsSeen: top, appsSeenAt: todayStr(), appsSeenDevices: n }); labsN++;
    softwareForLab(labId).forEach(({ ls, sw }) => { const hit = top.find(a => appMatch(sw.name, a.n)); DB.put('labSoftware', { ...ls, seenVersion: hit?.v || '', seenCount: hit?.c || 0, seenAt: todayStr() }); });
  });
  DB.log(`Imported installed apps (${name}) for ${labsN} labs`); return `${labsN} labs updated`;
}
function appsImport(host) {
  const I = UI.impApps ??= {};
  host.innerHTML = `<div class="card"><p class="small muted">Import an installed-software export (for example Intune <b>Discovered apps</b> per device, or a Mosyle app inventory): one row per device and application with columns for device name, application and version. Devices are matched by name to their lab; the tracker keeps a per-lab summary (not every row) and compares it with each lab’s expected software in <b>Reports → Software drift</b>.</p>
  ${dropHTML('Columns: device name, application name, version.')}${I.parsed ? `<h3 style="margin-top:16px">${esc(I.fileName)} – ${I.parsed.length - 1} rows</h3><p><button class="btn primary edit-only" id="apply">Apply to labs</button></p>` : ''}</div>`;
  bindDrop(host, (text, name) => { I.parsed = parseCSV(text); I.fileName = name; const t = tableFromRows(I.parsed), m = autoMap(t.headers, APP_FIELDS); if (!m.device || !m.app) toast('Could not find device-name and application columns.', 'err'); appsImport(host); });
  const ap = $('#apply', host); if (ap) ap.onclick = () => { try { toast(applyInstalledApps(I.parsed, I.fileName)); UI.impApps = {}; UI.repTab = 'drift'; location.hash = '#/reports'; } catch (e) { toast(e.message, 'err'); } };
}
function driftRows() {
  const rows = [];
  DB.data.labs.filter(l => l.appsSeen).forEach(lab => {
    const n = lab.appsSeenDevices || 1, exp = softwareForLab(lab.id);
    exp.forEach(({ ls, sw }) => {
      const want = ls.version || sw.version, seen = lab.appsSeen.find(a => appMatch(sw.name, a.n));
      if (!seen) rows.push({ lab, app: sw.name, kind: 'Missing', detail: 'Expected but not found on any device' });
      else if (seen.c < n * 0.8) rows.push({ lab, app: sw.name, kind: 'Partial', detail: `Installed on ${seen.c} of ${n} devices` });
      else if (want && seen.v && !String(seen.v).startsWith(String(want).split('.').slice(0, 2).join('.'))) rows.push({ lab, app: sw.name, kind: 'Version', detail: `Expected ${want}, found ${seen.v}` });
    });
    lab.appsSeen.filter(a => a.c >= n * 0.5 && !exp.some(({ sw }) => appMatch(sw.name, a.n)) && !/microsoft (edge|visual c|\.net)|runtime|redistributable|update|driver|webview/i.test(a.n)).slice(0, 15).forEach(a => rows.push({ lab, app: a.n, kind: 'Unexpected', detail: `On ${a.c} of ${n} devices (${a.v || 'version n/a'})` }));
  });
  return rows;
}
function driftReport(host) {
  const rows = driftRows().map((r, i) => ({ ...r, k: String(i) }));
  host.innerHTML = `<p class="muted small">Compares each lab’s expected software with the last installed-apps import (Import → Installed apps, or an <code>installed-apps.csv</code> in the imports folder). Version checks compare the first two version parts.</p><div id="tt"></div>`;
  mountTable($('#tt', host), { id: 'drift', csvName: 'software-drift', rows: () => rows, rowId: r => r.k, defaultSort: { k: 'kind', dir: 'asc' }, empty: 'No drift found – or no installed-apps import yet.',
    filters: [{ k: 'k', label: 'Finding', options: () => ['Missing', 'Partial', 'Version', 'Unexpected'], test: (r, v) => r.kind === v }, { k: 'l', label: 'Lab', options: labOptions, test: (r, v) => r.lab.id === v }],
    cols: [{ k: 'lab', label: 'Lab', val: r => labLabel(r.lab), html: r => `<a href="#/lab/${r.lab.id}">${esc(labLabel(r.lab))}</a>` }, { k: 'app', label: 'Application', val: r => r.app }, { k: 'kind', label: 'Finding', val: r => r.kind, html: r => `<span class="badge ${{ Missing: 'bad', Partial: 'warn', Version: 'warn', Unexpected: 'info' }[r.kind]}">${r.kind}</span>` }, { k: 'd', label: 'Detail', val: r => r.detail }] });
}

// ---- confirmations (replies to the replacement-notice emails) ----
const CONFIRM_STATUS = ['Sent', 'Confirmed', 'Changes requested', 'No response'];
function recordConfirmations(labs, emails) {
  const cs = DB.data.contacts.filter(c => c.email && emails.includes(c.email));
  labs.forEach(lab => cs.forEach(c => { const ex = DB.data.confirmations.find(x => x.labId === lab.id && x.contactId === c.id); DB.put('confirmations', { ...(ex || {}), labId: lab.id, contactId: c.id, status: 'Sent', sentDate: todayStr(), respondedDate: '' }); }));
}
const staleConfirm = c => c.status === 'Sent' && c.sentDate && daysBetween(c.sentDate, todayStr()) > 14;
function confirmationsView(host) {
  host.innerHTML = '<p class="muted small">Every replacement-notice email you prepare is logged here. Update the status when replies come in; “Sent” items older than 14 days are flagged for a reminder.</p><div id="tt"></div>';
  mountTable($('#tt', host), { id: 'confirm', csvName: 'confirmations', rows: () => DB.data.confirmations, rowId: r => r.id, defaultSort: { k: 'sent', dir: 'desc' }, empty: 'Nothing yet – use “Email contacts” on a lab or the plan.',
    onRow: id => editEntity('confirmation', id),
    filters: [{ k: 's', label: 'Status', options: () => CONFIRM_STATUS, test: (r, v) => r.status === v }, { k: 'o', label: 'Follow-up', options: () => ['Needs reminder'], test: staleConfirm }],
    cols: [{ k: 'lab', label: 'Lab', val: r => labLabel(DB.get('labs', r.labId)) }, { k: 'who', label: 'Contact', val: r => DB.get('contacts', r.contactId)?.name || '' }, { k: 'sent', label: 'Sent', val: r => r.sentDate || '', html: r => fmtDate(r.sentDate) },
    { k: 'st', label: 'Status', val: r => r.status, html: r => `<span class="badge ${{ Confirmed: 'ok', 'Changes requested': 'warn', 'No response': 'bad' }[r.status] || 'info'}">${r.status}</span>${staleConfirm(r) ? ' <span class="badge warn">remind</span>' : ''}` },
    { k: 'resp', label: 'Responded', val: r => r.respondedDate || '', html: r => fmtDate(r.respondedDate) }, { k: 'act', label: '', html: r => `<button class="btn sm edit-only" data-ok="${r.id}">Confirmed</button> <button class="btn sm edit-only" data-rm="${r.id}">Remind…</button>` }] });
  host.addEventListener('click', e => {
    const ok = e.target.closest('[data-ok]'), rm = e.target.closest('[data-rm]');
    if (ok) { const c = DB.get('confirmations', ok.dataset.ok); DB.put('confirmations', { ...c, status: 'Confirmed', respondedDate: todayStr() }); render(); }
    if (rm) { const c = DB.get('confirmations', rm.dataset.rm); composeNotice([DB.get('labs', c.labId)], [DB.get('contacts', c.contactId)].filter(Boolean)); }
  });
}
SCHEMA.confirmation = { title: 'Confirmation', table: 'confirmations', fields: [{ k: 'status', label: 'Status', type: 'select', req: true, options: CONFIRM_STATUS }, { k: 'sentDate', label: 'Sent', type: 'date' }, { k: 'respondedDate', label: 'Responded', type: 'date' }, { k: 'notes', label: 'Notes', type: 'textarea', wide: true }] };

// ---- baselines (standard software sets per lab type) ----
SCHEMA.baseline = { title: 'Baseline', table: 'baselines', fields: [{ k: 'name', label: 'Name', req: true, help: 'e.g. Windows general-purpose lab' }, { k: 'platform', label: 'Platform', type: 'select', options: ['Windows', 'Mac'] }, { k: 'softwareIds', label: 'Standard software', type: 'multi', wide: true, options: () => DB.data.software.map(s => ({ v: s.id, l: s.name })).sort((a, b) => cmp(a.l, b.l)) }, { k: 'notes', label: 'Notes', type: 'textarea', wide: true }] };
function baselinesView(host) {
  host.innerHTML = `<p class="muted small">A baseline is the standard software set for a type of lab. Assign one on the lab’s edit form; the lab’s Software tab then shows what it is missing or has extra.</p><div class="tbl-wrap"><table><thead><tr><th>Baseline</th><th>Platform</th><th class="num">Titles</th><th class="num">Labs</th><th></th></tr></thead><tbody>${DB.data.baselines.map(b => `<tr><td>${esc(b.name)}</td><td>${esc(b.platform || '')}</td><td class="num">${(b.softwareIds || []).length}</td><td class="num">${DB.data.labs.filter(l => l.baselineId === b.id).length}</td><td class="edit-only"><button class="btn sm" data-e="${b.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No baselines yet.</td></tr>'}</tbody></table></div><p><button class="btn primary edit-only" data-e="">${ic('plus')} Add baseline</button></p>`;
  host.onclick = e => { const b = e.target.closest('[data-e]'); if (b) editEntity('baseline', b.dataset.e || null); };
}
function baselineDiff(lab) {
  const b = DB.get('baselines', lab.baselineId); if (!b) return null;
  const have = new Set(softwareForLab(lab.id).map(x => x.sw.id)), want = new Set(b.softwareIds || []);
  return { b, missing: [...want].filter(id => !have.has(id)).map(id => DB.get('software', id)).filter(Boolean), extra: [...have].filter(id => !want.has(id)).map(id => DB.get('software', id)).filter(Boolean) };
}

// ---- license compliance ----
const seatsNeeded = sw => sum(DB.data.labSoftware.filter(x => x.softwareId === sw.id), x => { const lab = DB.get('labs', x.labId); return lab ? (+lab.seats || labStats(lab).qty || 0) : 0; });
function licenseReport(host) {
  const rows = DB.data.software.map(sw => { const need = seatsNeeded(sw), own = +sw.seatsOwned || 0; return { sw, need, own, labs: DB.data.labSoftware.filter(x => x.softwareId === sw.id).length, per: need ? (+sw.annualCost || 0) / need : 0 }; });
  const labCost = DB.data.labs.map(lab => ({ lab, cost: sum(softwareForLab(lab.id), ({ sw }) => { const n = seatsNeeded(sw); return n ? (+sw.annualCost || 0) / n * (+lab.seats || labStats(lab).qty || 0) : 0; }) })).filter(x => x.cost).sort((a, b) => b.cost - a.cost);
  host.innerHTML = `<p class="muted small">“Seats needed” adds up the seats of every lab where the title is installed. Enter “Seats owned” on the software record to see over- or under-licensing.</p>
  <div class="tbl-wrap"><table><thead><tr><th>Software</th><th class="num">Labs</th><th class="num">Seats needed</th><th class="num">Seats owned</th><th>Position</th><th class="num">Annual cost</th><th class="num">Cost / seat</th><th>Expires</th></tr></thead><tbody>${rows.sort((a, b) => b.sw.annualCost - a.sw.annualCost).map(r => `<tr><td>${esc(r.sw.name)}</td><td class="num">${r.labs}</td><td class="num">${fmtNum(r.need)}</td><td class="num">${r.own ? fmtNum(r.own) : '—'}</td><td>${!r.own ? '<span class="muted">enter seats owned</span>' : r.own < r.need ? `<span class="badge bad">short ${r.need - r.own}</span>` : r.own > r.need * 1.25 ? `<span class="badge warn">${r.own - r.need} unused</span>` : '<span class="badge ok">OK</span>'}</td><td class="num">${money(r.sw.annualCost)}</td><td class="num">${r.per ? money(r.per) : '—'}</td><td>${r.sw.licenseExpiry ? fmtDate(r.sw.licenseExpiry) : '—'}</td></tr>`).join('')}</tbody></table></div>
  <h3 style="margin-top:18px">Estimated software cost per lab (per year)</h3><div class="tbl-wrap"><table><thead><tr><th>Lab</th><th class="num">Seats</th><th class="num">Software cost</th><th class="num">Per seat</th></tr></thead><tbody>${labCost.map(x => `<tr><td><a href="#/lab/${x.lab.id}">${esc(labLabel(x.lab))}</a></td><td class="num">${x.lab.seats || ''}</td><td class="num">${money(x.cost)}</td><td class="num">${x.lab.seats ? money(x.cost / x.lab.seats) : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
