// Asset overview: lifecycle dashboard for managed devices (status, health, warranty, open repairs, where they are).
// "Health" is derived, not entered: Critical = unsupported OS or an open repair; Warning = OS ending soon, warranty ended or ending in 90 days, or no check-in past the stale limit.
function assetHealth(d, t, openIds) {
  const why = [];
  if (osState(d) === 'Unsupported') why.push('OS out of support');
  if (openIds.has(d.id)) why.push('Open repair');
  if (why.length) return { h: 'Critical', why };
  if (osState(d) === 'Ending soon') why.push('OS support ending');
  if (d.warrantyEnd) { const k = daysBetween(t, d.warrantyEnd); if (k < 0) why.push('Warranty expired'); else if (k <= 90) why.push('Warranty ends soon'); }
  if (d.lastCheckIn && daysBetween(d.lastCheckIn, t) > S().staleDays) why.push('No recent check-in');
  return { h: why.length ? 'Warning' : 'Safe', why };
}
const warrantyBucket = (d, t) => !d.warrantyEnd ? 'No date' : d.warrantyEnd < t ? 'Expired' : daysBetween(t, d.warrantyEnd) <= 90 ? 'About to expire' : 'In warranty';

VIEWS.assets = {
  render(el) {
    const A = UI.ad ??= { platform: '', buildingId: '', showArchived: false }, t = todayStr(), d0 = DB.data;
    let devs = d0.devices.filter(x => A.showArchived || devStatus(x) !== 'Archived');
    if (A.platform) devs = devs.filter(x => x.platform === A.platform);
    if (A.buildingId) devs = devs.filter(x => DB.get('labs', x.labId)?.buildingId === A.buildingId);
    const openJobs = d0.maintenances.filter(m => !m.endDate && m.deviceId), openIds = new Set(openJobs.map(m => m.deviceId));
    const H = new Map(devs.map(x => [x.id, assetHealth(x, t, openIds)]));
    const cnt = (f, order) => { const m = new Map(); devs.forEach(x => { const k = f(x); m.set(k, (m.get(k) || 0) + 1); }); let ks = [...m.keys()]; ks = order ? ks.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b))) : ks.sort((a, b) => m.get(b) - m.get(a)); return { labels: ks, values: ks.map(k => m.get(k)) }; };
    const spec = (type, c, title, extra = {}) => ({ type, labels: c.labels, series: [{ name: title, values: c.values }], title, metricLabel: 'assets', ...(type === 'donut' ? { compact: true } : type === 'hbar' ? { w: 440 } : {}), ...extra });
    const st = cnt(devStatus, DEVICE_STATUSES), hl = cnt(x => H.get(x.id).h, ['Safe', 'Warning', 'Critical']), wr = cnt(x => warrantyBucket(x, t), ['In warranty', 'About to expire', 'Expired', 'No date']);
    const nonActive = ['Ready to deploy', 'Pending', 'In repair'].map(s => [s, devs.filter(x => devStatus(x) === s).length]);
    // warranty expiry by month (next 12), stacked by platform
    const months = Array.from({ length: 12 }, (_, i) => addMonths(t, i).slice(0, 7)), plats = [...new Set(devs.map(x => x.platform || 'Other'))];
    const wm = { type: 'bar', labels: months.map(m => new Date(m + '-15').toLocaleString(undefined, { month: 'short', year: '2-digit' })), series: plats.map(p => ({ name: p, values: months.map(m => devs.filter(x => (x.platform || 'Other') === p && (x.warrantyEnd || '').slice(0, 7) === m).length) })), title: 'Warranty ends by month', w: 480 };
    // open repairs by model
    const repByModel = [...group(devs.filter(x => openIds.has(x.id)), x => x.model || 'Unknown')].map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const bld = cnt(x => labBuilding(x.labId)), src = cnt(x => x.source || 'Manual'), os = cnt(x => osState(x) === 'Unsupported' ? 'Unsupported OS' : osState(x) === 'Ending soon' ? 'OS ending soon' : 'Supported / no date', ['Supported / no date', 'OS ending soon', 'Unsupported OS']), ci = cnt(checkInBucket, ['≤ 7 days', '8–30 days', `31–${S().staleDays} days`, `> ${S().staleDays} days (stale)`, 'Never / unknown']);
    const mdl = cnt(x => x.model || 'Unknown'), top = { labels: mdl.labels.slice(0, 10), values: mdl.values.slice(0, 10) };
    const attn = devs.filter(x => H.get(x.id).h !== 'Safe').sort((a, b) => (H.get(a.id).h === 'Critical' ? 0 : 1) - (H.get(b.id).h === 'Critical' ? 0 : 1) || H.get(b.id).why.length - H.get(a.id).why.length).slice(0, 10);
    const card = (id, title, link) => `<div class="card"><div class="card-h"><h3>${esc(title)}</h3>${link ? `<span class="spacer"></span>${link}` : ''}</div><div id="${id}"></div></div>`;
    const list = rows => rows.length ? `<ul class="alerts">${rows.map(([k, n, h]) => `<li><a href="${h || '#/devices'}">${esc(k)}</a><span class="spacer" style="flex:1"></span><b class="big-n" style="font-size:20px">${n}</b></li>`).join('')}</ul>` : '<div class="empty">None.</div>';
    const secs = [
      { id: 'top', title: 'Asset summary', html: `<div class="grid g4">
        <div class="card"><div class="card-h"><h3>Total assets</h3></div><div class="bigtile"><span class="big-n">${fmtNum(devs.length)}</span><div class="small muted">${devs.length === d0.devices.length ? 'all managed devices' : `of ${fmtNum(d0.devices.length)} after filters`}</div></div></div>
        ${card('ad-st', 'Total assets by status')}
        <div class="card"><div class="card-h"><h3>Non-active assets by status</h3></div>${list(nonActive.map(([k, n]) => [k, n]))}</div>
        ${card('ad-hl', 'Total assets by health status')}</div>`, note: 'Health: Critical = unsupported OS or open repair; Warning = OS ending, warranty ended/ending, or stale check-in' },
      { id: 'life', title: 'Warranty and repairs', html: `<div class="grid g3">
        <div class="card"><div class="card-h"><h3>Assets with open repairs</h3><span class="spacer"></span><a href="#/maintenance">Maintenance →</a></div>${list(repByModel.map(([k, n]) => [k, n, '#/maintenance']))}</div>
        ${card('ad-wr', 'Assets by warranty status')}${card('ad-wm', 'Assets by warranty expiry month')}</div>` },
      { id: 'where', title: 'Where assets are', html: `<div class="grid g2">${card('ad-bld', 'Assets by building')}${card('ad-top', 'Top models')}</div><div class="grid g3">${card('ad-os', 'Operating system support')}${card('ad-ci', 'Last check-in')}${card('ad-src', 'Source of record')}</div>` },
      { id: 'attn', title: 'Assets that need attention', html: `<div class="card">${attn.length ? `<div class="tbl-wrap"><table><thead><tr><th>Asset</th><th>Lab</th><th>Platform</th><th>Health</th><th>Why</th></tr></thead><tbody>${attn.map(x => `<tr data-go="${x.id}"><td><a href="#/device/${x.id}">${esc(x.name || x.serial || x.id)}</a><div class="small muted">${esc(x.model || '')}</div></td><td>${x.labId ? esc(labLabel(DB.get('labs', x.labId))) : '<span class="muted">Unassigned</span>'}</td><td>${esc(x.platform || '')}</td><td><span class="badge ${H.get(x.id).h === 'Critical' ? 'bad' : 'warn'}">${H.get(x.id).h}</span></td><td class="small">${esc(H.get(x.id).why.join(' · '))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Every asset is healthy.</div>'}</div>` }
    ];
    const tools = `<div class="card no-print"><div class="toolbar"><div class="field"><label>Platform</label><select id="ad-p"><option value="">All</option>${optionsHTML(PLATFORMS, A.platform)}</select></div><div class="field"><label>Building</label><select id="ad-b"><option value="">All</option>${optionsHTML(buildingOptions(), A.buildingId)}</select></div><label class="chk"><input type="checkbox" id="ad-a"${A.showArchived ? ' checked' : ''}> Include archived</label></div></div>`;
    el.innerHTML = pageHead('Asset overview', `<a class="btn" href="#/devices">All devices</a><button class="btn" onclick="window.print()">${ic('file')} Print</button>`, 'Asset overview') + tools + (devs.length || d0.devices.length ? dashLayout('assets', secs) : '<div class="card empty">No managed devices yet. Import Intune, Mosyle or LabStats exports to populate this page.</div>');
    $('#ad-p', el).onchange = e => { A.platform = e.target.value; render(); }; $('#ad-b', el).onchange = e => { A.buildingId = e.target.value; render(); }; $('#ad-a', el).onchange = e => { A.showArchived = e.target.checked; render(); };
    const put = (id, s) => { const h = $('#' + id, el); if (h) renderChart(h, s); };
    put('ad-st', spec('donut', st, 'Status')); put('ad-hl', spec('donut', hl, 'Health')); put('ad-wr', spec('hbar', wr, 'Warranty')); put('ad-wm', wm);
    put('ad-bld', spec('hbar', bld, 'Building', { w: 760 })); put('ad-top', spec('hbar', top, 'Model', { w: 760 })); put('ad-os', spec('donut', os, 'OS support')); put('ad-ci', spec('bar', ci, 'Check-in')); put('ad-src', spec('donut', src, 'Source'));
  }
};
