// Device detail, maintenance, reports, global search.
VIEWS.device = {
  render(el, id) {
    const d = DB.get('devices', id);
    if (!d) { el.innerHTML = pageHead('Device not found') + '<a href="#/devices">Back to devices</a>'; return; }
    const tab = UI.devTab || 'maintenance', lab = DB.get('labs', d.labId), maint = maintenancesFor(m => m.deviceId === d.id), hist = historyFor('devices', d.id);
    const stale = d.lastCheckIn && daysBetween(d.lastCheckIn, todayStr()) > S().staleDays;
    el.innerHTML = pageHead(d.name, `${d.labId ? `<button class="btn edit-only" data-act="checkin">${ic('checkin')} Check in</button>` : ''}<button class="btn edit-only" data-act="checkout">${ic('checkout')} ${d.labId ? 'Move to another lab' : 'Check out to lab'}</button>${d.serial && isLenovo(d) ? `${lenovoKey() ? `<button class="btn edit-only" data-act="lenovo">${ic('search')} Look up warranty</button>` : ''}<a class="btn" target="_blank" rel="noopener" href="${lenovoSupportUrl(d.serial)}">Lenovo support ↗</a>` : ''}${d.serial && isApple(d) ? `<button class="btn edit-only" data-act="apple">${ic('search')} Apple coverage</button>` : ''}${d.disposal ? '' : `<button class="btn edit-only" data-act="dispose">Retire / dispose</button>`}<button class="btn edit-only" data-act="edit">Edit</button>`, `<a href="#/devices">Devices</a> › ${esc(d.name)}`) + `
    <div class="split"><div class="card"><div class="card-h"><h3>Device details</h3>${statusBadge(devStatus(d))}</div>
      <dl class="dl"><dt>Asset tag</dt><dd>${esc(d.assetTag || '—')}</dd><dt>Serial</dt><dd>${esc(d.serial || '—')}</dd><dt>Model</dt><dd>${esc(d.model || '—')}${d.manufacturer ? ` <span class="muted">(${esc(d.manufacturer)})</span>` : ''}</dd><dt>Platform</dt><dd>${esc(d.platform || '—')}</dd>
      <dt>OS</dt><dd>${esc(d.os || '—')} <span class="muted small">${esc(d.osVersion || '')}</span></dd><dt>Lab</dt><dd>${lab ? `<a href="#/lab/${lab.id}">${esc(labLabel(lab))}</a>` : '<span class="muted">Not checked out</span>'}</dd>
      <dt>Primary user</dt><dd>${esc(d.user || '—')}</dd><dt>Source</dt><dd>${esc(d.source || 'Manual')}${d.missing ? ' <span class="badge bad">not in last export</span>' : ''}</dd>
      <dt>Last check-in</dt><dd>${fmtDate(d.lastCheckIn)} ${stale ? '<span class="badge warn">stale</span>' : ''}</dd><dt>Purchased</dt><dd>${fmtDate(d.purchaseDate)}${d.purchaseCost ? ' · ' + money(d.purchaseCost) : ''}</dd>
      <dt>Warranty ends</dt><dd>${d.warrantyEnd ? fmtDate(d.warrantyEnd) + (d.warrantyEnd < todayStr() ? ' <span class="badge bad">expired</span>' : '') : '—'}${d.warrantyChecked ? `<div class="muted small">${esc(d.warrantySource || '')} · checked ${fmtDate(d.warrantyChecked)}${d.warrantyProduct ? ' · ' + esc(d.warrantyProduct) : ''}</div>` : ''}</dd>${d.ramGB || d.storageGB ? `<dt>Memory / storage</dt><dd>${d.ramGB ? d.ramGB + ' GB RAM' : ''}${d.ramGB && d.storageGB ? ' · ' : ''}${d.storageGB ? fmtStorage(d.storageGB) : ''}</dd>` : ''}${d.disposal ? `<dt>Disposal</dt><dd>${fmtDate(d.disposal.date)} · ${esc(d.disposal.method)}<div class="muted small">${esc(d.disposal.sanitization)}${d.disposal.cert ? ' · ' + esc(d.disposal.cert) : ''}</div></dd>` : ''}${d.group ? `<dt>LabStats group</dt><dd>${esc(d.group)}</dd>` : ''}</dl>
      ${d.docLinks ? `<p class="small"><b>Links:</b><br>${linksHTML(d.docLinks)}</p>` : ''}${d.lastAudited ? `<p class="small muted">Last audited ${fmtDate(d.lastAudited)}</p>` : ''}${d.notes ? `<p class="small">${esc(d.notes)}</p>` : ''}</div>
    <div><div class="tabs"><a data-tab="maintenance" class="${tab === 'maintenance' ? 'on' : ''}">Maintenance<span class="tc">${maint.length}</span></a><a data-tab="history" class="${tab === 'history' ? 'on' : ''}">History<span class="tc">${hist.length}</span></a></div>
    ${tab === 'maintenance' ? `<div class="card"><div class="card-h"><h3>Maintenance & repairs</h3><span class="spacer"></span><button class="btn sm primary edit-only" data-act="addm">${ic('plus')} Log maintenance</button></div>${maintTable(maint)}</div>` : `<div class="card"><div class="card-h"><h3>Change history</h3></div>${timelineHTML(hist)}</div>`}</div></div>`;
    el.onclick = e => {
      const t = e.target, act = t.closest('[data-act]')?.dataset.act, tb = t.closest('[data-tab]');
      if (tb) { UI.devTab = tb.dataset.tab; return render(); }
      const mr = t.closest('tr[data-m]'); if (mr && !t.closest('a,button')) return editEntity('maintenance', mr.dataset.m);
      if (act === 'edit') editEntity('device', d.id); else if (act === 'checkout') assignDevicesDialog([d.id], () => { }); else if (act === 'checkin') checkinDevices([d.id], () => { });
      else if (act === 'addm') editEntity('maintenance', null, { deviceId: d.id, labId: d.labId }); else if (act === 'lenovo') lenovoLookupDevices([d.id]).then(() => render()); else if (act === 'apple') appleCoverageDialog([d.id], true); else if (act === 'dispose') disposeDialog([d.id]);
    };
  }
};

VIEWS.maintenance = {
  render(el) {
    el.innerHTML = pageHead('Maintenance', `<button class="btn primary edit-only" data-act="add">${ic('plus')} Log maintenance</button>`) + `<p class="muted small" style="margin-top:-8px">Repairs, upgrades and routine work on devices and labs. Open jobs show on the dashboard; costs feed the charts.</p><div id="t"></div>`;
    mountTable($('#t', el), {
      id: 'maint', csvName: 'maintenance', rows: () => DB.data.maintenances, rowId: r => r.id, onRow: id => editEntity('maintenance', id), defaultSort: { k: 'start', dir: 'desc' }, empty: 'Nothing logged yet.',
      filters: [{ k: 's', label: 'Status', options: () => ['Open', 'Completed'], test: (r, v) => v === 'Open' ? !r.endDate : !!r.endDate }, { k: 't', label: 'Type', options: () => ['Repair', 'Maintenance', 'Upgrade', 'Hardware test', 'Software / OS', 'Other'], test: (r, v) => r.type === v }, { k: 'l', label: 'Lab', options: labOptions, test: (r, v) => r.labId === v }],
      cols: [
        { k: 'start', label: 'Started', val: r => r.startDate || '', html: r => fmtDate(r.startDate) }, { k: 'title', label: 'Title', val: r => r.title }, { k: 'type', label: 'Type', val: r => r.type },
        { k: 'dev', label: 'Device', val: r => DB.get('devices', r.deviceId)?.name || '', html: r => { const d = DB.get('devices', r.deviceId); return d ? `<a href="#/device/${d.id}">${esc(d.name)}</a>` : '—'; } },
        { k: 'lab', label: 'Lab', val: r => r.labId ? labLabel(DB.get('labs', r.labId)) : '' }, { k: 'vendor', label: 'Vendor', val: r => r.vendor },
        { k: 'cost', label: 'Cost', val: r => +r.cost || 0, html: r => money(r.cost), num: true },
        { k: 'st', label: 'Status', val: r => r.endDate ? 'Completed' : 'Open', html: r => r.endDate ? `<span class="badge ok">Completed ${fmtDate(r.endDate)}</span>` : '<span class="badge warn">Open</span>' }],
      foot: (c, rows) => c.k === 'title' ? 'Total' : c.k === 'cost' ? money(sum(rows, r => +r.cost || 0)) : ''
    });
    el.onclick = e => { if (e.target.closest('[data-act="add"]')) editEntity('maintenance'); };
  }
};

const REPORT_EXT = {};
VIEWS.reports = {
  render(el) {
    const tab = UI.repTab || 'depreciation', t = todayStr();
    el.innerHTML = pageHead('Reports') + `<div class="tabs">${[['depreciation', 'Depreciation'], ['drift', 'Software drift'], ['licenses', 'Licenses'], ['tco', 'Cost of ownership'], ['rightsize', 'Right-sizing'], ['trends', 'Usage trends'], ['surplus', 'Surplus & redeploy'], ['quality', 'Data quality'], ['calendar', 'Calendar export'], ['activity', 'Activity log'], ['ossupport', 'OS support'], ['funding', 'Funding'], ['expiring', 'Licenses & warranties'], ['health', 'Device health'], ['finance', 'Scenarios & rollover'], ['cleanup', 'Cleanup']].map(([k, l]) => `<a data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div><div id="t"></div>`;
    const host = $('#t', el);
    if (REPORT_EXT[tab]) REPORT_EXT[tab](host);
    else if (tab === 'depreciation') {
      const lines = DB.data.hardware.filter(isActiveLine);
      host.innerHTML = `<div class="kpis">${tile('', 'dollar', '', money(sum(lines, lineCost)), 'Purchase / replacement cost')}${tile('', 'trend', 'warnk', money(sum(lines, l => lineCost(l) - bookValue(l))), 'Depreciated to date')}${tile('', 'cpu', 'good', money(sum(lines, bookValue)), 'Current book value')}</div><p class="muted small">Straight-line over each line’s lifecycle (model or platform default), no salvage value, measured from the last replacement (or purchase) date.</p><div id="tt"></div>`;
      mountTable($('#tt', host), {
        id: 'dep', csvName: 'depreciation', rows: () => lines, rowId: r => r.id, onRow: id => editEntity('hardware', id), defaultSort: { k: 'pct', dir: 'desc' },
        filters: [{ k: 'p', label: 'Platform', options: () => PLATFORMS, test: (r, v) => platformOf(r) === v }, { k: 'b', label: 'Building', options: buildingOptions, test: (r, v) => DB.get('labs', r.labId)?.buildingId === v }],
        cols: [
          { k: 'lab', label: 'Lab', val: r => labLabel(DB.get('labs', r.labId)) }, { k: 'model', label: 'Model', val: modelName }, { k: 'qty', label: 'Qty', val: r => +r.qty || 0, num: true },
          { k: 'cost', label: 'Cost', val: lineCost, html: r => money(lineCost(r)), num: true }, { k: 'since', label: 'Since', val: r => ageBase(r), html: r => fmtDate(ageBase(r)) },
          { k: 'life', label: 'Lifecycle (yrs)', val: lifecycleYears, num: true }, { k: 'pct', label: '% depreciated', val: r => lineCost(r) ? Math.round((1 - bookValue(r) / lineCost(r)) * 100) : 0, html: r => { const p = lineCost(r) ? Math.round((1 - bookValue(r) / lineCost(r)) * 100) : 0; return `${p}%<div class="meter"><i style="width:${p}%;${p >= 100 ? 'background:var(--danger)' : ''}"></i></div>`; }, num: true },
          { k: 'val', label: 'Book value', val: bookValue, html: r => money(bookValue(r)), num: true }, { k: 'yr', label: 'Per year', val: r => lineCost(r) / lifecycleYears(r), html: r => money(lineCost(r) / lifecycleYears(r)), num: true }],
        foot: (c, rows) => c.k === 'lab' ? 'Total (filtered)' : c.k === 'qty' ? fmtNum(sum(rows, r => +r.qty || 0)) : c.k === 'cost' ? money(sum(rows, lineCost)) : c.k === 'val' ? money(sum(rows, bookValue)) : c.k === 'yr' ? money(sum(rows, r => lineCost(r) / lifecycleYears(r))) : ''
      });
    } else if (tab === 'activity') {
      const rows = activityRows().map((r, i) => ({ ...r, k: String(i) }));
      mountTable(host, {
        id: 'activity', csvName: 'activity-log', rows: () => rows, rowId: r => r.k, defaultSort: null, pageSize: 50, empty: 'No activity recorded yet.',
        filters: [{ k: 'a', label: 'Action', options: () => ['add', 'edit', 'del', 'note'], test: (r, v) => r.a === v }, { k: 'u', label: 'User', options: () => [...new Set(rows.map(r => r.who).filter(Boolean))].sort(), test: (r, v) => r.who === v }, { k: 't', label: 'Type', options: () => Object.entries(TABLE_LABEL).map(([v, l]) => ({ v, l })), test: (r, v) => r.t === v }],
        cols: [
          { k: 'when', label: 'When', val: r => r.when, html: r => new Date(r.when).toLocaleString() }, { k: 'who', label: 'User', val: r => r.who },
          { k: 'a', label: 'Action', val: r => r.a, html: r => `<span class="badge ${{ add: 'ok', del: 'bad', edit: 'info' }[r.a] || ''}">${{ add: 'Created', del: 'Deleted', edit: 'Updated', note: 'Note' }[r.a]}</span>` },
          { k: 't', label: 'Type', val: r => TABLE_LABEL[r.t] || '' }, { k: 'n', label: 'Item', val: r => r.n, html: r => recHref(r.t, r.id) ? `<a href="${recHref(r.t, r.id)}">${esc(r.n)}</a>` : esc(r.n) },
          { k: 'f', label: 'Changes', val: r => r.f ? Object.entries(r.f).map(([k, [o, n]]) => `${k}: ${o} → ${n}`).join('; ') : '', html: r => r.f ? `<span class="chg">${Object.entries(r.f).map(([k, [o, n]]) => `<b>${esc(k)}</b>: ${o ? `<s>${esc(o)}</s> → ` : ''}${esc(n || '—')}`).join(' · ')}</span>` : '' }]
      });
    } else if (tab === 'ossupport') { osSupportReport(host);
    } else if (tab === 'drift') { driftReport(host);
    } else if (tab === 'tco') { tcoReport(host); } else if (tab === 'rightsize') { rightSizeReport(host); } else if (tab === 'trends') { trendsReport(host); }
    else if (tab === 'surplus') { surplusReport(host); } else if (tab === 'quality') { qualityReport(host); } else if (tab === 'calendar') { calendarReport(host);
    } else if (tab === 'licenses') { licenseReport(host);
    } else if (tab === 'funding') {
      const lines = DB.data.hardware.filter(isActiveLine), by = group(lines, l => l.fundingSource || 'Unknown'), byP = group(lines, plannedFundingOf);
      host.innerHTML = `<div class="grid g2">${chartCard('Purchases by fiscal year and funding source', { dataset: 'hardware', group: 'purchaseFY', split: 'funding', metric: 'cost', type: 'bar' })}${chartCard('Planned replacement spend by funding source', { dataset: 'hardware', group: 'fy', split: 'plannedFunding', metric: 'cost', type: 'bar' })}</div>
      <div class="grid g2"><div class="card"><div class="card-h"><h3>Purchased with</h3></div><table><thead><tr><th>Funding source</th><th class="num">Lines</th><th class="num">Devices</th><th class="num">Cost</th><th class="num">Book value</th></tr></thead><tbody>${[...by].sort((a, b) => sum(b[1], lineCost) - sum(a[1], lineCost)).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.length}</td><td class="num">${fmtNum(sum(v, l => +l.qty || 0))}</td><td class="num">${money(sum(v, lineCost))}</td><td class="num">${money(sum(v, bookValue))}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><div class="card-h"><h3>Planned replacement funding</h3></div><table><thead><tr><th>Funding source</th><th class="num">Lines</th><th class="num">Devices</th><th class="num">Replacement cost (est.)</th></tr></thead><tbody>${[...byP].map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.length}</td><td class="num">${fmtNum(sum(v, l => +l.qty || 0))}</td><td class="num">${money(sum(v, lineCost))}</td></tr>`).join('')}</tbody></table><p class="small muted">Set “Planned replacement funding” on a hardware line to move its cost to another source (for example a Tech fee project).</p></div></div>`;
    } else if (tab === 'expiring') {
      const sw = DB.data.software.filter(s => s.licenseExpiry).sort((a, b) => cmp(a.licenseExpiry, b.licenseExpiry)), dv = DB.data.devices.filter(d => d.warrantyEnd).sort((a, b) => cmp(a.warrantyEnd, b.warrantyEnd));
      const badge = dt => { const n = daysBetween(t, dt); return n < 0 ? `<span class="badge bad">expired ${-n}d ago</span>` : n <= 90 ? `<span class="badge warn">${n} days</span>` : `<span class="badge">${n} days</span>`; };
      host.innerHTML = `<div class="grid g2"><div class="card"><div class="card-h"><h3>Software licenses</h3></div>${sw.length ? `<table><thead><tr><th>Title</th><th>Vendor</th><th>Expires</th><th>In</th><th class="num">Annual cost</th></tr></thead><tbody>${sw.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.vendor || '')}</td><td>${fmtDate(s.licenseExpiry)}</td><td>${badge(s.licenseExpiry)}</td><td class="num">${money(s.annualCost)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No license dates recorded.</div>'}</div>
      <div class="card"><div class="card-h"><h3>Device warranties</h3></div>${dv.length ? `<table><thead><tr><th>Device</th><th>Lab</th><th>Ends</th><th>In</th></tr></thead><tbody>${dv.slice(0, 200).map(d => `<tr><td><a href="#/device/${d.id}">${esc(d.name)}</a></td><td>${esc(d.labId ? labLabel(DB.get('labs', d.labId)) : '')}</td><td>${fmtDate(d.warrantyEnd)}</td><td>${badge(d.warrantyEnd)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No warranty dates recorded. Add them on a device.</div>'}</div></div>`;
    } else {
      const issues = d => [!d.labId && 'Not checked out', d.lastCheckIn && daysBetween(d.lastCheckIn, t) > S().staleDays && 'Stale', d.missing && 'Missing from export', !d.assetTag && 'No asset tag'].filter(Boolean);
      mountTable(host, {
        id: 'health', csvName: 'device-health', rows: () => DB.data.devices.filter(d => issues(d).length), rowId: r => r.id, onRow: id => location.hash = '#/device/' + id, defaultSort: { k: 'name', dir: 'asc' }, empty: 'Every device is healthy.',
        filters: [{ k: 'i', label: 'Issue', options: () => ['Not checked out', 'Stale', 'Missing from export', 'No asset tag'], test: (r, v) => issues(r).includes(v) }],
        cols: [{ k: 'name', label: 'Name', val: r => r.name }, { k: 'model', label: 'Model', val: r => r.model }, { k: 'lab', label: 'Lab', val: r => r.labId ? labLabel(DB.get('labs', r.labId)) : '' }, { k: 'chk', label: 'Last check-in', val: r => r.lastCheckIn || '', html: r => fmtDate(r.lastCheckIn) },
        { k: 'iss', label: 'Issues', val: r => issues(r).join(', '), html: r => issues(r).map(i => `<span class="badge ${i === 'No asset tag' ? '' : 'warn'}">${i}</span>`).join(' ') }]
      });
    }
    el.onclick = e => { const tb = e.target.closest('[data-tab]'); if (tb) { UI.repTab = tb.dataset.tab; render(); } };
  }
};

// ---------- global search ----------
const SEARCH_KINDS = [
  ['labs', 'Labs', () => DB.data.labs, r => labLabel(r), r => [r.department, r.type].filter(Boolean).join(' · '), r => `#/lab/${r.id}`],
  ['devices', 'Devices', () => DB.data.devices, r => r.name, r => [r.assetTag, r.serial, r.model].filter(Boolean).join(' · '), r => `#/device/${r.id}`, r => [r.name, r.assetTag, r.serial, r.model, r.user].join(' ')],
  ['hardware', 'Hardware', () => DB.data.hardware, r => `${modelName(r)} × ${r.qty}`, r => labLabel(DB.get('labs', r.labId)), null, r => modelName(r) + ' ' + labLabel(DB.get('labs', r.labId))],
  ['software', 'Software', () => DB.data.software, r => r.name, r => r.vendor || '', null],
  ['contacts', 'Contacts', () => DB.data.contacts, r => r.name, r => [r.role, r.email].filter(Boolean).join(' · '), null, r => [r.name, r.role, r.email].join(' ')],
  ['models', 'Models', () => DB.data.models, r => r.name, r => r.manufacturer || '', null],
  ['maintenances', 'Maintenance', () => DB.data.maintenances, r => r.title, r => r.type, null]
];
const EDIT_KIND = { hardware: 'hardware', software: 'software', contacts: 'contact', models: 'model', maintenances: 'maintenance' };
function runSearch(q) {
  q = q.trim().toLowerCase(); const box = $('#gs-res');
  if (q.length < 2) { box.hidden = true; return; }
  let html = '', n = 0;
  for (const [t, label, rows, name, sub, href, hay] of SEARCH_KINDS) {
    const hits = rows().filter(r => (hay ? hay(r) : name(r) + ' ' + sub(r)).toLowerCase().includes(q)).slice(0, 6);
    if (!hits.length) continue; n += hits.length;
    html += `<div class="gh">${label}</div>` + hits.map(r => `<a href="${href ? href(r) : '#'}" data-open="${href ? '' : t + '|' + r.id}"><b>${esc(name(r))}</b><span class="muted small">${esc(sub(r))}</span></a>`).join('');
  }
  box.innerHTML = html || '<div class="none">No matches.</div>'; box.hidden = false;
}
