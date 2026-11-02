// Dashboard, replacement plan, labs, lab detail.
const chartCard = (title, cfg, extra = '') => `<div class="card"><div class="card-h"><h3>${esc(title)}</h3>${extra}</div><div data-title="${esc(title)}" data-cfg="${esc(JSON.stringify(cfg))}"></div></div>`;
const utilBadge = lab => {
  const u = lab.usage?.util; if (u == null) return '<span class="muted">—</span>';
  return `<span class="badge ${u < S().lowUtilPct ? 'warn' : u >= 75 ? 'info' : ''}" title="${esc(lab.usage.period || '')}">${pct(u)}</span>`;
};

function replaceLineDialog(lineId, after) {
  const l = DB.get('hardware', lineId), lab = DB.get('labs', l.labId);
  const form = document.createElement('form'); form.className = 'form-grid';
  const fields = [
    { k: 'date', label: 'Replacement date', type: 'date', req: true }, { k: 'modelText', label: 'New model', list: 'dl-models', req: true },
    { k: 'qty', label: 'Quantity installed', type: 'number', min: 0, req: true }, { k: 'unitCost', label: 'Actual unit cost', type: 'number', min: 0, help: 'Blank = catalog price' },
    { k: 'os', label: 'Operating system', list: 'dl-os' }, { k: 'fundingSource', label: 'Purchased with', type: 'select', options: fundingOptions }, { k: 'fundingRef', label: 'Project / PO number' }];
  form.innerHTML = dlModels() + fields.map(f => fieldHTML(f, { date: todayStr(), modelText: modelName(l), qty: l.qty, os: l.os, unitCost: '', fundingSource: plannedFundingOf(l), fundingRef: '' }[f.k])).join('') +
    `<div class="field wide help">Records the old setup in the line’s history, resets the age clock, and clears any planned-date override.</div>`;
  form.addEventListener('submit', e => e.preventDefault());
  modal({
    title: `Mark replaced – ${labLabel(lab)}`, body: form, buttons: [{ label: 'Cancel' }, {
      label: 'Mark replaced', cls: 'primary', onClick: () => {
        if (!form.reportValidity()) return false;
        const o = readFields(form, fields), m = findOrCreateModel(o.modelText, platformOf(l));
        const history = [...(l.history || []), { date: l.lastReplaced || l.purchaseDate || '', model: modelName(l), qty: l.qty, unitCost: unitCostOf(l), funding: l.fundingSource || '', by: DB.user }];
        DB.put('hardware', { ...l, modelId: m.id, platform: m.platform || l.platform, qty: o.qty, unitCost: o.unitCost, os: o.os, lastReplaced: o.date, purchaseDate: o.date, plannedOverride: '', status: 'In service', fundingSource: o.fundingSource, fundingRef: o.fundingRef, plannedFunding: 'Replacement budget', history });
        DB.log(`Replaced ${l.qty} × ${modelName(l)} with ${o.qty} × ${m.name} in ${labLabel(lab)}`); toast('Replacement recorded'); (after || render)();
      }
    }]
  });
}

// ---------------- Dashboard ----------------
const presetCfg = title => CHART_PRESETS.find(p => p.title === title);
const tile = (href, icon, cls, v, l, s = '') => `<${href ? 'a' : 'div'} class="kpi ${cls}"${href ? ` href="${href}"` : ''}><span class="ico">${ic(icon)}</span><span><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</span></${href ? 'a' : 'div'}>`;
VIEWS.dashboard = {
  render(el) {
    const d = DB.data, t = todayStr(), to = addMonths(t, S().warnMonths);
    const lines = d.hardware.filter(isActiveLine);
    const over = lines.filter(l => lineState(l) === 'Overdue');
    const soon = lines.filter(l => { const p = plannedDate(l); return p && p >= t && p <= to; });
    const unassigned = d.devices.filter(x => !x.labId && !['Archived', 'Lost / stolen'].includes(devStatus(x))).length;
    const noDate = lines.filter(l => !plannedDate(l)).length, noCost = d.models.filter(m => !(+m.unitCost)).length;
    const stale = d.devices.filter(x => x.lastCheckIn && daysBetween(x.lastCheckIn, t) > S().staleDays && devStatus(x) !== 'Archived').length;
    const exp = d.software.filter(s => s.licenseExpiry && daysBetween(t, s.licenseExpiry) <= S().licenseWarnDays);
    const warr = d.devices.filter(x => x.warrantyEnd && daysBetween(t, x.warrantyEnd) >= 0 && daysBetween(t, x.warrantyEnd) <= 90).length;
    const noHw = d.labs.filter(lab => lab.status !== 'Closed' && !labStats(lab).lines.length).length;
    const lowUtil = d.labs.filter(lab => lab.usage?.util != null && lab.usage.util < S().lowUtilPct).length;
    const openM = d.maintenances.filter(m => !m.endDate).length, osBad = d.devices.filter(x => osState(x) === 'Unsupported' && devStatus(x) !== 'Archived').length;
    const alerts = [
      over.length && ['bad', `${over.length} hardware line(s) are past their planned replacement date`, '#/plan'],
      DB.data.confirmations.filter(staleConfirm).length && ['warn', `${DB.data.confirmations.filter(staleConfirm).length} lab notice(s) have had no reply for over 14 days`, '#/software'],
      osBad && ['bad', `${osBad} device(s) run an operating system that is out of support`, '#/reports'],
      openM && ['warn', `${openM} maintenance job(s) are still open`, '#/maintenance'],
      noDate && ['warn', `${noDate} hardware line(s) have no purchase / last-replaced date, so they can’t be scheduled`, '#/hardware'],
      unassigned && ['warn', `${unassigned} device(s) are not checked out to a lab`, '#/devices'],
      noCost && ['warn', `${noCost} model(s) have no unit cost, so estimates are understated`, '#/models'],
      exp.length && ['warn', `${exp.length} software license(s) expire within ${S().licenseWarnDays} days (${exp.slice(0, 3).map(s => s.name).join(', ')}${exp.length > 3 ? '…' : ''})`, '#/reports'],
      warr && ['warn', `${warr} device warranty(ies) end within 90 days`, '#/reports'],
      stale && ['', `${stale} device(s) haven’t checked in for over ${S().staleDays} days`, '#/reports'],
      lowUtil && ['', `${lowUtil} lab(s) are under ${S().lowUtilPct}% utilization in LabStats – consider right-sizing before replacing`, '#/labs'],
      noHw && ['', `${noHw} lab(s) have no hardware lines yet`, '#/labs'],
      ...automationAlerts()
    ].filter(Boolean);
    const upcoming = lines.filter(l => plannedDate(l) && plannedDate(l) <= to).sort((a, b) => cmp(plannedDate(a), plannedDate(b))).slice(0, 8);
    const feed = activityRows().filter(r => r.a !== 'note').slice(0, 8);
    const secs = [
      { id: 'kpis', title: 'Key figures', html: `<div class="kpis">
      ${tile('#/labs', 'monitor', '', fmtNum(d.labs.length), 'Labs', `${d.buildings.length} buildings`)}
      ${tile('#/devices', 'laptop', 'infok', fmtNum(d.devices.length), 'Managed devices', `${fmtNum(sum(lines, l => +l.qty || 0))} in inventory`)}
      ${tile('#/plan', 'alert', over.length ? 'bad' : 'good', fmtNum(sum(over, l => +l.qty || 0)), 'Overdue devices', `${money(sum(over, lineCost))} to replace`)}
      ${tile('#/plan', 'calendar', 'warnk', fmtNum(sum(soon, l => +l.qty || 0)), `Due in ${S().warnMonths} months`, `${money(sum(soon, lineCost))} estimated`)}
      ${tile('#/reports', 'dollar', '', money(sum(lines, lineCost)), 'Inventory at cost', `${money(sum(lines, bookValue))} book value`)}
      ${tile('#/software', 'package', '', fmtNum(d.software.length), 'Software titles', `${money(sum(d.software, s => +s.annualCost || 0))} / yr`)}
      ${tile('#/maintenance', 'tool', openM ? 'warnk' : '', fmtNum(openM), 'Open maintenance', `${money(sum(d.maintenances, m => +m.cost || 0))} total spend`)}
      ${tile('#/inventory', 'package', '', fmtNum(sum(d.stock, l => +l.qty || 0) + stockDevices().length), 'In stock', `${fmtNum(sum(d.stock.filter(l => l.state === 'Ready to deploy'), l => +l.qty || 0) + stockDevices().filter(x => devStatus(x) === 'Ready to deploy').length)} ready to deploy`)}
      ${tile('#/contacts', 'users', '', fmtNum(d.contacts.length), 'Contacts')}
    </div>` },
      { id: 'spend', title: 'Spend and status', html: `<div class="grid g2">${chartCard('Planned replacement spend by fiscal year', presetCfg('Planned replacement spend by fiscal year').cfg)}${chartCard('Replacement status', presetCfg('Replacement status').cfg)}</div>` },
      { id: 'attn', title: 'Needs attention and next replacements', html: `<div class="grid g2">
      <div class="card"><div class="card-h"><h3>Needs attention</h3></div>${alerts.length ? `<ul class="alerts">${alerts.map(([k, m, h]) => `<li><span class="badge ${k}">${k === 'bad' ? 'Urgent' : k === 'warn' ? 'Check' : 'FYI'}</span><a href="${h}">${esc(m)}</a></li>`).join('')}</ul>` : '<div class="empty">All clear.</div>'}</div>
      <div class="card"><div class="card-h"><h3>Next replacements</h3><span class="spacer"></span><a href="#/plan">Full plan →</a></div>
      ${upcoming.length ? `<table><thead><tr><th>Lab</th><th>Model</th><th class="num">Qty</th><th>Planned</th><th class="num">Est. cost</th></tr></thead><tbody>${upcoming.map(l => `<tr><td><a href="#/lab/${l.labId}">${esc(labLabel(DB.get('labs', l.labId)))}</a></td><td>${esc(modelName(l))}</td><td class="num">${l.qty}</td><td class="nowrap">${fmtDate(plannedDate(l))} ${lineState(l) === 'Overdue' ? stateBadge('Overdue') : ''}</td><td class="num">${money(lineCost(l))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nothing due in this window.</div>'}</div>
    </div>` },
      { id: 'mix', title: 'Devices and operating systems', html: `<div class="grid g2">${chartCard('Devices by status', presetCfg('Devices by status').cfg)}${chartCard('Managed devices by operating system', presetCfg('Managed devices by operating system').cfg)}</div>` },
      { id: 'age', title: 'Hardware age and recent activity', html: `<div class="grid g2">${chartCard('Hardware age', presetCfg('Hardware age').cfg)}
      <div class="card"><div class="card-h"><h3>Recent activity</h3><span class="spacer"></span><a href="#/reports">View all →</a></div>
      ${feed.length ? `<ul class="feed">${feed.map(r => `<li><span class="av">${esc(initials(r.who))}</span><div><div><b>${esc(r.who)}</b> <span class="muted">${r.a === 'add' ? 'added' : r.a === 'del' ? 'deleted' : 'updated'}</span> ${recHref(r.t, r.id) ? `<a href="${recHref(r.t, r.id)}">${esc(r.n)}</a>` : esc(r.n)}</div><div class="small muted">${esc(TABLE_LABEL[r.t] || r.t)} · ${new Date(r.when).toLocaleString()}</div></div></li>`).join('')}</ul>` : '<div class="empty">Changes will show up here.</div>'}</div></div>` }
    ];
    if (d.charts.length) secs.push({ id: 'pins', title: 'Pinned charts', html: `<div class="grid g2">${d.charts.map(c => chartCard(c.title, c.cfg, `<span class="spacer"></span><button class="btn sm edit-only" data-unpin="${c.id}">Unpin</button>`)).join('')}</div>` });
    el.innerHTML = pageHead('Dashboard', `<a class="btn" href="#/exec">${ic('trend')} Executive summary</a>`, 'Dashboard') + dashLayout('dash', secs);
    el.onclick = e => { const u = e.target.closest('[data-unpin]'); if (u) { DB.remove('charts', u.dataset.unpin); render(); } };
  }
};

// ---------------- Replacement plan ----------------
function planPeriod(preset) {
  const t = todayStr(), fy = fiscalYear(t);
  return {
    warn: [t, addMonths(t, S().warnMonths)], fy0: fyRange(fy), fy1: fyRange(fy + 1), fy01: [fyRange(fy)[0], fyRange(fy + 1)[1]],
    cal: [`${t.slice(0, 4)}-01-01`, `${t.slice(0, 4)}-12-31`], q: [t, addMonths(t, 3)], y2: [t, addMonths(t, 24)]
  }[preset];
}
function planRows(plan) {
  return plan.lines.map(x => {
    const lab = x.lab, l = x.line, b = DB.get('buildings', lab.buildingId);
    return [b?.name || '', lab.room, lab.name || '', platformOf(l), modelName(l), l.qty, unitCostOf(l), x.cost, l.os || '', modelSpec(getModel(l)), l.lastReplaced || '', x.planned, x.flag, l.fundingSource || '', plannedFundingOf(l), l.fundingRef || '',
    softwareForLab(lab.id).map(s => s.sw.name).join('; '), contactsForLab(lab).map(c => `${c.c.name}${c.c.email ? ' <' + c.c.email + '>' : ''}`).join('; ')];
  });
}
VIEWS.plan = {
  render(el) {
    const P = UI.plan ??= { preset: 'warn', overdue: true, platform: '', buildingId: '', mode: 'lab' };
    if (P.preset !== 'custom') [P.from, P.to] = planPeriod(P.preset);
    el.innerHTML = pageHead('Lab replacement plan', `<button class="btn edit-only" id="p-mail">${ic('file')} Notify contacts</button><button class="btn" id="p-csv">Export CSV</button><button class="btn" onclick="window.print()">Print</button>`) + `
    <div class="card no-print"><div class="toolbar">
      <div class="field"><label>Period</label><select id="p-preset">${optionsHTML([['warn', `Next ${S().warnMonths} months`], ['q', 'Next 3 months'], ['fy0', 'Current fiscal year'], ['fy1', 'Next fiscal year'], ['fy01', 'This + next fiscal year'], ['cal', 'This calendar year'], ['y2', 'Next 24 months'], ['custom', 'Custom range']].map(([v, l]) => ({ v, l })), P.preset)}</select></div>
      <div class="field"><label>From</label><input type="date" id="p-from" value="${P.from}"></div><div class="field"><label>To</label><input type="date" id="p-to" value="${P.to}"></div>
      <div class="field"><label>Platform</label><select id="p-plat"><option value="">All</option>${optionsHTML(PLATFORMS, P.platform)}</select></div>
      <div class="field"><label>Building</label><select id="p-bld"><option value="">All</option>${optionsHTML(buildingOptions(), P.buildingId)}</select></div>
      <div class="field"><label>View</label><select id="p-mode">${optionsHTML([{ v: 'lab', l: 'By lab (with software & contacts)' }, { v: 'flat', l: 'Flat list' }], P.mode)}</select></div>
      <label class="chk"><input type="checkbox" id="p-over"${P.overdue ? ' checked' : ''}> Include overdue / earlier items</label></div></div>
    <div id="p-out"></div>`;
    const out = () => {
      const plan = replacementPlan(P), o = $('#p-out');
      const byPlat = group(plan.lines, x => platformOf(x.line));
      const qtrs = new Map(); plan.lines.forEach(x => { const k = x.planned < P.from ? 'Earlier / overdue' : `FY${fiscalYear(x.planned)} Q${fiscalQuarter(x.planned)}`; const p = platformOf(x.line); if (!qtrs.has(k)) qtrs.set(k, {}); qtrs.get(k)[p] = (qtrs.get(k)[p] || 0) + x.cost; });
      const qlabels = [...qtrs.keys()].sort((a, b) => (a[0] === 'E' ? -1 : 0) - (b[0] === 'E' ? -1 : 0) || cmp(a, b)), plats = PLATFORMS.filter(p => byPlat.has(p));
      o.innerHTML = `<div class="kpis"><div class="kpi"><div class="v">${plan.labs.length}</div><div class="l">Labs affected</div></div><div class="kpi"><div class="v">${fmtNum(plan.qty)}</div><div class="l">Devices to replace</div></div><div class="kpi"><div class="v">${money(plan.cost)}</div><div class="l">Estimated cost</div></div>
        ${plats.map(p => `<div class="kpi"><div class="v">${fmtNum(sum(byPlat.get(p), x => +x.line.qty || 0))}</div><div class="l">${p} devices</div><div class="s">${money(sum(byPlat.get(p), x => x.cost))}</div></div>`).join('')}</div>
        ${plan.lines.length ? `<div class="card"><div class="card-h"><h3>Estimated cost by fiscal quarter</h3><span class="spacer"></span><span class="muted small">Planned funding:</span>${[...group(plan.lines, x => plannedFundingOf(x.line))].map(([k, v]) => `<span class="badge acc">${esc(k)} · ${money(sum(v, x => x.cost))}</span>`).join('')}</div><div id="p-chart"></div></div>` : ''}
        ${plan.lines.length ? (P.mode === 'flat' ? planFlat(plan) : plan.labs.map(planLabBlock).join('')) : '<div class="card empty">No replacements fall in this period. Check that hardware lines have purchase / last-replaced dates.</div>'}`;
      if (plan.lines.length) renderChart($('#p-chart'), { type: 'bar', labels: qlabels, series: plats.map(p => ({ name: p, values: qlabels.map(q => qtrs.get(q)[p] || 0) })), money: true, title: 'Estimated cost by fiscal quarter' });
      $('#p-mail').onclick = () => notifyPlanDialog(plan);
      $('#p-csv').onclick = () => download(`lab-replacements_${P.from}_to_${P.to}.csv`, toCSV([['Building', 'Room', 'Lab', 'Platform', 'Model', 'Qty', 'Unit cost', 'Est. cost', 'OS', 'Specs', 'Last replaced', 'Planned', 'Status', 'Purchased with', 'Planned funding', 'Project / PO', 'Software', 'Contacts'], ...planRows(plan)]));
    };
    const sync = () => { $('#p-from').value = P.from; $('#p-to').value = P.to; };
    el.querySelector('.toolbar').addEventListener('change', e => {
      const id = e.target.id;
      if (id === 'p-preset') { P.preset = e.target.value; if (P.preset !== 'custom') [P.from, P.to] = planPeriod(P.preset); sync(); }
      else if (id === 'p-from' || id === 'p-to') { P[id === 'p-from' ? 'from' : 'to'] = e.target.value; P.preset = 'custom'; $('#p-preset').value = 'custom'; }
      else if (id === 'p-plat') P.platform = e.target.value; else if (id === 'p-bld') P.buildingId = e.target.value;
      else if (id === 'p-mode') P.mode = e.target.value; else if (id === 'p-over') P.overdue = e.target.checked;
      out();
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-replace]'); if (b) replaceLineDialog(b.dataset.replace);
      const em = e.target.closest('[data-email]'); if (em) { const lab = DB.get('labs', em.dataset.email); composeNotice([lab], contactsForLab(lab).map(c => c.c)); }
    });
    out();
  }
};
const flagBadge = f => `<span class="badge ${f === 'Overdue' ? 'bad' : f === 'Carry-over' ? 'warn' : 'info'}">${f}</span>`;
function planFlat(plan) {
  return `<div class="tbl-wrap"><table><thead><tr><th>Lab</th><th>Platform</th><th>Model</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Est. cost</th><th>Last replaced</th><th>Planned</th><th></th><th class="no-print"></th></tr></thead><tbody>
  ${plan.lines.map(x => `<tr><td><a href="#/lab/${x.lab.id}">${esc(labLabel(x.lab))}</a></td><td>${platformOf(x.line)}</td><td>${esc(modelName(x.line))}</td><td class="num">${x.line.qty}</td><td class="num">${money(unitCostOf(x.line))}</td><td class="num">${money(x.cost)}</td><td>${fmtDate(x.line.lastReplaced || x.line.purchaseDate)}</td><td>${fmtDate(x.planned)}</td><td>${flagBadge(x.flag)}</td><td class="no-print edit-only"><button class="btn sm" data-replace="${x.line.id}">Mark replaced</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3">Total</td><td class="num">${fmtNum(plan.qty)}</td><td></td><td class="num">${money(plan.cost)}</td><td colspan="4"></td></tr></tfoot></table></div>`;
}
function planLabBlock(g) {
  const lab = g.lab, b = DB.get('buildings', lab.buildingId), sw = softwareForLab(lab.id), cs = contactsForLab(lab), u = lab.usage?.util;
  return `<div class="lab-block"><div class="hd"><b><a href="#/lab/${lab.id}">${esc(labLabel(lab))}</a></b><span class="muted">${esc(b?.name || '')}${lab.department ? ' · ' + esc(lab.department) : ''}</span>${labPlatforms(lab).map(p => `<span class="badge info">${p}</span>`).join('')}
    ${u != null ? `<span class="badge ${u < S().lowUtilPct ? 'warn' : ''}" title="LabStats ${esc(lab.usage.period || '')}">LabStats ${pct(u)}${u < S().lowUtilPct ? ' – low use' : ''}</span>` : ''}<span class="spacer"></span><b>${fmtNum(g.qty)} devices · ${money(g.cost)}</b><button class="btn sm no-print edit-only" data-email="${lab.id}">${ic('file')} Email contacts</button></div>
    <div class="bd"><table><thead><tr><th>Model</th><th>Platform</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Est. cost</th><th>OS</th><th>Specs</th><th>Last replaced</th><th>Planned</th><th></th><th class="no-print"></th></tr></thead><tbody>
    ${g.lines.map(x => `<tr><td>${esc(modelName(x.line))}</td><td>${platformOf(x.line)}</td><td class="num">${x.line.qty}</td><td class="num">${money(unitCostOf(x.line))}</td><td class="num">${money(x.cost)}</td><td>${esc(x.line.os || '')}</td><td class="small">${esc(modelSpec(getModel(x.line)))}</td><td>${fmtDate(x.line.lastReplaced || x.line.purchaseDate)}</td><td>${fmtDate(x.planned)}</td><td>${flagBadge(x.flag)}</td><td class="no-print edit-only"><button class="btn sm" data-replace="${x.line.id}">Mark replaced</button></td></tr>`).join('')}</tbody></table>
    <p class="small"><b>Software to reinstall:</b> ${sw.length ? sw.map(s => `<span class="pill">${esc(s.sw.name)}</span>`).join('') : '<span class="muted">none recorded</span>'}</p>
    <p class="small"><b>Notify:</b> ${cs.length ? cs.map(c => `<span class="pill" title="${esc(c.why.join(', '))}">${esc(c.c.name)}${c.c.role ? ' (' + esc(c.c.role) + ')' : ''}${c.c.email ? ' · ' + esc(c.c.email) : ''}</span>`).join('') : '<span class="muted">no contacts linked</span>'}</p></div></div>`;
}

// ---------------- Labs ----------------
VIEWS.labs = {
  render(el) {
    el.innerHTML = pageHead('Labs', `<button class="btn" data-act="bld">Buildings</button><button class="btn primary edit-only" data-act="add">Add lab</button>`) + `<div id="t"></div>`;
    mountTable($('#t', el), {
      id: 'labs', csvName: 'labs', rows: () => DB.data.labs, rowId: r => r.id, onRow: id => location.hash = '#/lab/' + id, empty: 'No labs yet. Add one, or import your list from the Import page.',
      defaultSort: { k: 'lab', dir: 'asc' },
      searchText: r => [labLabel(r), r.department, r.type].join(' '),
      filters: [
        { k: 'b', label: 'Building', options: buildingOptions, test: (r, v) => r.buildingId === v },
        { k: 'p', label: 'Platform', options: () => PLATFORMS, test: (r, v) => labPlatforms(r).includes(v) },
        { k: 's', label: 'Replacement', options: () => ['Overdue', 'Due soon'], test: (r, v) => labStats(r).lines.some(l => lineState(l) === v) }],
      cols: [
        { k: 'lab', label: 'Lab', val: labLabel, html: r => `<a href="#/lab/${r.id}">${esc(labLabel(r))}</a>` },
        { k: 'bld', label: 'Building', val: r => DB.get('buildings', r.buildingId)?.name || '' }, { k: 'dept', label: 'Department', val: r => r.department },
        { k: 'plat', label: 'Platform', val: labPlatformText }, { k: 'seats', label: 'Seats', val: r => +r.seats || 0, num: true },
        { k: 'inv', label: 'Inventory qty', val: r => labStats(r).qty, num: true }, { k: 'mng', label: 'Managed devices', val: r => labStats(r).managed, num: true },
        { k: 'util', label: 'LabStats util.', val: r => r.usage?.util ?? null, html: utilBadge, csv: r => r.usage?.util ?? '', num: true },
        { k: 'next', label: 'Next replacement', val: r => labStats(r).next, html: r => { const s = labStats(r); return s.next ? fmtDate(s.next) + (s.overdue ? ' ' + stateBadge('Overdue') : '') : '—'; } },
        { k: 'cost', label: 'Inventory cost', val: r => labStats(r).cost, html: r => money(labStats(r).cost), num: true }]
    });
    el.onclick = e => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'add') editEntity('lab'); if (a === 'bld') buildingsDialog(); };
  }
};
function buildingsDialog() {
  const body = document.createElement('div');
  const draw = () => {
    body.innerHTML = `<table><thead><tr><th>Name</th><th>Code</th><th class="num">Labs</th><th></th></tr></thead><tbody>${DB.data.buildings.map(b => `<tr><td>${esc(b.name)}</td><td>${esc(b.code || '')}</td><td class="num">${DB.data.labs.filter(l => l.buildingId === b.id).length}</td><td class="edit-only"><button class="btn sm" data-e="${b.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No buildings yet</td></tr>'}</tbody></table><p><button class="btn edit-only" data-e="">Add building</button></p>`;
  };
  draw();
  body.onclick = e => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    editEntity('building', b.dataset.e || null, {}, () => setTimeout(buildingsDialog, 0));
  };
  modal({ title: 'Buildings', body, buttons: [{ label: 'Close', cls: 'primary' }] });
}

// ---------------- Lab detail ----------------
const LAB_TABS = [['overview', 'Overview'], ['hardware', 'Hardware'], ['devices', 'Devices'], ['software', 'Software'], ['contacts', 'Contacts'], ['maintenance', 'Maintenance'], ['history', 'History']];
VIEWS.lab = {
  render(el, id) {
    const lab = DB.get('labs', id);
    if (!lab) { el.innerHTML = pageHead('Lab not found') + '<a href="#/labs">Back to labs</a>'; return; }
    const tab = UI.labTab || 'overview';
    const st = labStats(lab), b = DB.get('buildings', lab.buildingId), sw = softwareForLab(lab.id), cs = contactsForLab(lab), plats = labPlatforms(lab), u = lab.usage;
    const allLines = linesByLab().get(lab.id) || [], maint = maintenancesFor(m => m.labId === lab.id);
    const counts = { hardware: allLines.length, devices: st.devs.length, software: sw.length, contacts: cs.length, maintenance: maint.length };
    const byModel = group(st.devs, d => (d.model || 'Unknown').toLowerCase()), invByModel = group(st.lines, l => modelName(l).toLowerCase());
    const keys = [...new Set([...byModel.keys(), ...invByModel.keys()])].sort();
    const body = {
      overview: () => `<div class="kpis">
        ${tile('', 'cpu', '', fmtNum(st.qty), 'In inventory', plats.join(' + ') || 'no hardware yet')}
        ${tile('', 'laptop', 'infok', fmtNum(st.managed), 'Managed devices')}
        ${tile('', 'dollar', '', money(st.cost), 'Inventory cost', `${money(sum(st.lines, bookValue))} book value`)}
        ${tile('', 'calendar', st.overdue ? 'bad' : 'good', st.next ? fmtDate(st.next) : '—', 'Next replacement', st.overdue ? st.overdue + ' line(s) overdue' : '')}</div>
        <div class="card"><div class="card-h"><h3>Managed devices vs. inventory</h3><span class="spacer"></span><button class="btn sm edit-only" data-act="sync" title="Set inventory quantities from what Intune/Mosyle report">Sync inventory from devices</button></div>
        ${keys.length ? `<table><thead><tr><th>Model</th><th class="num">Managed</th><th class="num">Inventory</th><th class="num">Diff</th><th>Operating systems</th></tr></thead><tbody>${keys.map(k => {
        const ds = byModel.get(k) || [], ls = invByModel.get(k) || [], inv = sum(ls, l => +l.qty || 0), osm = {};
        ds.forEach(d => osm[d.os || 'Unknown'] = (osm[d.os || 'Unknown'] || 0) + 1);
        return `<tr><td>${esc(ds[0]?.model || (ls[0] ? modelName(ls[0]) : k))}</td><td class="num">${ds.length}</td><td class="num">${inv}</td><td class="num">${ds.length - inv ? `<span class="badge warn">${ds.length - inv > 0 ? '+' : ''}${ds.length - inv}</span>` : '<span class="badge ok">match</span>'}</td><td>${Object.entries(osm).map(([o, n]) => `<span class="pill">${esc(o)} × ${n}</span>`).join('')}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">No devices linked yet. Import from Intune / Mosyle, or set this lab’s match keywords.</div>'}</div>
        ${lab.notes ? `<div class="card"><h3>Notes</h3><p>${esc(lab.notes)}</p></div>` : ''}`,
      hardware: () => `<div class="card"><div class="card-h"><h3>Hardware lines</h3><span class="spacer"></span><button class="btn sm edit-only" data-act="addhw">${ic('plus')} Add hardware</button></div>
        ${allLines.length ? `<div class="tbl-wrap"><table><thead><tr><th>Model</th><th>Platform</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Cost</th><th class="num">Book value</th><th>Specs</th><th>Funding</th><th>Last replaced</th><th>Planned</th><th>Status</th><th></th></tr></thead><tbody>${allLines.map(l => `<tr data-id="${l.id}"><td>${esc(modelName(l))}</td><td>${platformOf(l)}</td><td class="num">${l.qty}</td><td class="num">${money(unitCostOf(l))}</td><td class="num">${money(lineCost(l))}</td><td class="num">${money(bookValue(l))}</td><td class="small">${esc(modelSpec(getModel(l)))}${l.os ? `<div class="muted">${esc(l.os)}</div>` : ''}</td><td class="small">${esc(l.fundingSource || '—')}${l.fundingRef ? `<div class="muted">${esc(l.fundingRef)}</div>` : ''}${l.docLinks ? `<div>${linksHTML(l.docLinks)}</div>` : ''}</td><td>${fmtDate(ageBase(l))}</td><td>${fmtDate(plannedDate(l))}</td><td>${isActiveLine(l) ? stateBadge(lineState(l)) : esc(l.status)}</td><td class="edit-only nowrap"><button class="btn sm" data-replace="${l.id}">Mark replaced</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No hardware recorded.</div>'}</div>`,
      devices: () => `<div class="card"><div class="card-h"><h3>Devices checked out to this lab</h3><span class="spacer"></span><a class="btn sm" href="#/devices" data-lab="${lab.id}">Open in Devices</a></div>
        ${st.devs.length ? `<div class="tbl-wrap" style="max-height:60vh"><table><thead><tr><th>Name</th><th>Asset tag</th><th>Model</th><th>OS</th><th>Status</th><th>Last check-in</th></tr></thead><tbody>${st.devs.slice().sort((a, b) => cmp(a.name, b.name)).slice(0, 300).map(d => `<tr><td><a href="#/device/${d.id}">${esc(d.name)}</a></td><td>${esc(d.assetTag || '')}</td><td>${esc(d.model || '')}</td><td>${esc(d.os || '')}</td><td>${statusBadge(devStatus(d))}</td><td>${fmtDate(d.lastCheckIn)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No devices linked yet.</div>'}</div>`,
      software: () => { const bd = baselineDiff(lab); return (bd ? `<div class="card"><div class="card-h"><h3>Baseline: ${esc(bd.b.name)}</h3><span class="spacer"></span>${bd.missing.length ? `<button class="btn sm edit-only" data-act="addbase">Add ${bd.missing.length} missing</button>` : ''}</div><p class="small">${bd.missing.length ? `<b>Missing:</b> ${bd.missing.map(s => `<span class="pill">${esc(s.name)}</span>`).join('')}` : '<span class="badge ok">Matches the baseline</span>'}${bd.extra.length ? `<br><b>Extra:</b> ${bd.extra.map(s => `<span class="pill">${esc(s.name)}</span>`).join('')}` : ''}</p></div>` : '') + `<div class="card"><div class="card-h"><h3>Installed software</h3><span class="spacer"></span><button class="btn sm edit-only" data-act="copysw">Copy from another lab</button><button class="btn sm primary edit-only" data-act="addsw">${ic('plus')} Add</button></div>
        ${sw.length ? `<table><tbody>${sw.sort((a, b) => cmp(a.sw.name, b.sw.name)).map(({ ls, sw }) => `<tr><td>${esc(sw.name)} <span class="muted small">${esc(ls.version || sw.version || '')}</span>${ls.seenAt ? ` <span class="badge ${ls.seenCount ? 'ok' : 'bad'}" title="Last installed-apps import ${ls.seenAt}">${ls.seenCount ? 'found ' + esc(ls.seenVersion || '') + ' ×' + ls.seenCount : 'not found'}</span>` : ''}</td><td class="small muted">${(sw.platforms || []).join(' / ')}</td><td class="small muted">${esc(sw.deployment || '')}</td><td class="right edit-only nowrap"><button class="btn sm" data-editsw="${ls.id}">Edit</button> <button class="btn sm" data-rmsw="${ls.id}">Remove</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No software recorded.</div>'}</div>`; },
      contacts: () => `<div class="card"><div class="card-h"><h3>Who to contact</h3></div>${cs.length ? `<table><tbody>${cs.map(c => `<tr><td><b>${esc(c.c.name)}</b><div class="small muted">${esc(c.c.role || '')}${c.c.email ? ` · <a href="mailto:${esc(c.c.email)}">${esc(c.c.email)}</a>` : ''}${c.c.phone ? ' · ' + esc(c.c.phone) : ''}</div></td><td class="small">${c.why.map(w => `<span class="pill">${esc(w)}</span>`).join('')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No contacts linked. Add contacts to the lab or to its software.</div>'}</div>`,
      maintenance: () => `<div class="card"><div class="card-h"><h3>Maintenance & repairs</h3><span class="spacer"></span><button class="btn sm primary edit-only" data-act="addm">${ic('plus')} Log maintenance</button></div>${maintTable(maint)}</div>`,
      history: () => `<div class="card"><div class="card-h"><h3>Change history</h3></div>${timelineHTML(labHistory(lab.id))}</div>`
    }[tab]();
    el.innerHTML = pageHead(labLabel(lab), `<a class="btn" href="#/labsheet/${lab.id}">${ic('file')} Lab sheet</a><button class="btn edit-only" data-act="email">${ic('file')} Email contacts</button><button class="btn edit-only" data-act="edit">Edit lab</button><button class="btn primary edit-only" data-act="addhw">${ic('plus')} Add hardware</button>`, `<a href="#/labs">Labs</a> › ${esc(labLabel(lab))}`) + `
    <div class="split"><div>
      <div class="card"><div class="card-h"><h3>Lab details</h3><span class="badge ${lab.status === 'Closed' ? '' : 'ok'} dot">${esc(lab.status || 'Active')}</span></div>
        <dl class="dl"><dt>Building</dt><dd>${esc(b?.name || '—')}</dd><dt>Room</dt><dd>${esc(lab.room)}</dd><dt>Department</dt><dd>${esc(lab.department || '—')}</dd><dt>Type</dt><dd>${esc(lab.type || '—')}</dd><dt>Seats</dt><dd>${lab.seats || '—'}</dd>
        <dt>Platform</dt><dd>${plats.map(p => `<span class="badge acc">${p}</span>`).join(' ') || '—'}</dd><dt>Last notified</dt><dd>${lab.notified?.length ? `${fmtDate(lab.notified.at(-1).date)} <span class="muted small">by ${esc(lab.notified.at(-1).by)}</span>` : '<span class="muted">never</span>'}</dd><dt>Match keywords</dt><dd>${lab.match ? esc(lab.match) : '<span class="muted">none</span>'}</dd></dl></div>
      <div class="card"><div class="card-h"><h3>LabStats utilization</h3></div>${u && u.util != null ? `<div style="font-size:26px;font-weight:700">${pct(u.util)}</div><div class="meter"><i style="width:${Math.min(100, u.util)}%;${u.util < S().lowUtilPct ? 'background:var(--warn)' : ''}"></i></div><p class="small muted">${fmtNum(u.hours)} hrs · ${fmtNum(u.sessions)} sessions · ${esc(u.period || '')}${u.util < S().lowUtilPct ? '<br><b style="color:var(--warn)">Low use – consider right-sizing</b>' : ''}</p>` : '<div class="small muted">No LabStats data yet. Import a usage report.</div>'}</div></div>
    <div><div class="tabs">${LAB_TABS.map(([k, l]) => `<a data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}${counts[k] != null ? `<span class="tc">${counts[k]}</span>` : ''}</a>`).join('')}</div>${body}</div></div>`;
    el.onclick = e => {
      const t = e.target, act = t.closest('[data-act]')?.dataset.act;
      const tb = t.closest('[data-tab]'); if (tb) { UI.labTab = tb.dataset.tab; return render(); }
      const rep = t.closest('[data-replace]'); if (rep) return replaceLineDialog(rep.dataset.replace);
      const rm = t.closest('[data-rmsw]'); if (rm) { DB.remove('labSoftware', rm.dataset.rmsw); return render(); }
      const es = t.closest('[data-editsw]'); if (es) return editEntity('labSoftware', es.dataset.editsw);
      const dv = t.closest('[data-lab]'); if (dv) { (UI.tbl['devices'] ??= { q: '', sort: null, page: 0, f: {}, sel: new Set(), size: 50 }).f.lab = dv.dataset.lab; return; }
      const mr = t.closest('tr[data-m]'); if (mr && !t.closest('a,button')) return editEntity('maintenance', mr.dataset.m);
      if (act === 'edit') editEntity('lab', lab.id);
      else if (act === 'email') composeNotice([lab], cs.map(c => c.c));
      else if (act === 'addhw') editEntity('hardware', null, { labId: lab.id });
      else if (act === 'addm') editEntity('maintenance', null, { labId: lab.id });
      else if (act === 'addbase') { baselineDiff(lab).missing.forEach(s => DB.put('labSoftware', { labId: lab.id, softwareId: s.id })); DB.log('Applied baseline to ' + labLabel(lab)); render(); }
      else if (act === 'addsw') addSoftwareToLab(lab);
      else if (act === 'copysw') copySoftware(lab);
      else if (act === 'sync') syncInventory(lab);
      else if (tab === 'hardware' && t.closest('tr[data-id]') && !t.closest('button,a')) editEntity('hardware', t.closest('tr[data-id]').dataset.id);
    };
  }
};
const maintTable = list => list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Title</th><th>Type</th><th>Device</th><th>Vendor</th><th class="num">Cost</th><th>Status</th></tr></thead><tbody>${list.map(m => { const dv = DB.get('devices', m.deviceId); return `<tr data-m="${m.id}" style="cursor:pointer"><td class="nowrap">${fmtDate(m.startDate)}</td><td>${esc(m.title)}</td><td>${esc(m.type)}</td><td>${dv ? `<a href="#/device/${dv.id}">${esc(dv.name)}</a>` : '—'}</td><td>${esc(m.vendor || '')}</td><td class="num">${money(m.cost)}</td><td>${m.endDate ? '<span class="badge ok">Completed ' + fmtDate(m.endDate) + '</span>' : '<span class="badge warn">Open</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No maintenance logged.</div>';
function addSoftwareToLab(lab) {
  const have = new Set(softwareForLab(lab.id).map(x => x.sw.id)), plats = labPlatforms(lab);
  const opts = DB.data.software.filter(s => !have.has(s.id)).sort((a, b) => cmp(a.name, b.name));
  if (!opts.length) return toast('Every title in the catalog is already on this lab (or the catalog is empty).');
  const body = document.createElement('div');
  body.innerHTML = `<p class="muted small">Titles that don’t run on this lab’s platform (${plats.join(', ') || 'unknown'}) are dimmed.</p><div class="multi" style="grid-template-columns:1fr;max-height:50vh">${opts.map(s => { const ok = !plats.length || (s.platforms || []).some(p => plats.includes(p)); return `<label class="chk" style="${ok ? '' : 'opacity:.45'}"><input type="checkbox" value="${s.id}"> ${esc(s.name)} <span class="muted small">${(s.platforms || []).join('/')}</span></label>`; }).join('')}</div>`;
  modal({
    title: 'Add software to ' + labLabel(lab), body, buttons: [{ label: 'Cancel' }, {
      label: 'Add selected', cls: 'primary', onClick: () => {
        const ids = $$('input:checked', body).map(i => i.value); ids.forEach(sid => DB.put('labSoftware', { labId: lab.id, softwareId: sid }));
        if (ids.length) DB.log(`Added ${ids.length} software title(s) to ${labLabel(lab)}`); render();
      }
    }]
  });
}
function copySoftware(lab) {
  const others = DB.data.labs.filter(l => l.id !== lab.id && (swByLab().get(l.id) || []).length);
  if (!others.length) return toast('No other lab has software recorded yet.');
  const body = document.createElement('div');
  body.innerHTML = `<div class="field"><label>Copy software list from</label><select>${optionsHTML(others.map(l => ({ v: l.id, l: labLabel(l) })))}</select></div>`;
  modal({
    title: 'Copy software', body, buttons: [{ label: 'Cancel' }, {
      label: 'Copy', cls: 'primary', onClick: () => {
        const have = new Set(softwareForLab(lab.id).map(x => x.sw.id)); let n = 0;
        softwareForLab($('select', body).value).forEach(({ sw }) => { if (!have.has(sw.id)) { DB.put('labSoftware', { labId: lab.id, softwareId: sw.id }); n++; } });
        DB.log(`Copied ${n} software titles into ${labLabel(lab)}`); toast(`Added ${n} title(s)`); render();
      }
    }]
  });
}
function syncInventory(lab) {
  const st = labStats(lab); if (!st.devs.length) return toast('No managed devices are linked to this lab.');
  const byModel = group(st.devs.filter(d => d.model), d => d.model.toLowerCase()), plan = [];
  for (const [k, ds] of byModel) {
    const ln = st.lines.find(l => modelName(l).toLowerCase() === k), osCount = {};
    ds.forEach(d => osCount[d.os] = (osCount[d.os] || 0) + 1);
    plan.push({ k, ds, ln, os: Object.entries(osCount).sort((a, b) => b[1] - a[1])[0]?.[0] });
  }
  const msg = plan.map(p => `• ${p.ds[0].model}: ${p.ln ? `${p.ln.qty} → ${p.ds.length}` : `new line × ${p.ds.length}`}`).join('\n');
  if (!confirm(`Update inventory for ${labLabel(lab)} from managed devices?\n\n${msg}\n\nLines not seen in managed devices are left alone.`)) return;
  plan.forEach(p => {
    if (p.ln) DB.put('hardware', { ...p.ln, qty: p.ds.length, os: p.os || p.ln.os });
    else { const m = findOrCreateModel(p.ds[0].model, p.ds[0].platform, p.ds[0].manufacturer); DB.put('hardware', { labId: lab.id, modelId: m.id, platform: m.platform, qty: p.ds.length, unitCost: null, os: p.os, status: 'In service', notes: 'Created from managed devices – add purchase / last-replaced date' }); }
  });
  DB.log(`Synced inventory for ${labLabel(lab)} from managed devices`); toast('Inventory updated'); render();
}
