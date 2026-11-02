// Automation that runs on load, on remote changes and when the Projects page opens: it keeps the data moving without clicks.
// 1) projects are created from the plan  2) status follows the dates entered  3) completing a project updates the lab's hardware
// 4) imported devices are re-linked to labs by name  5) labs without a baseline pick the only one for their platform
function noticeState(p) {
  const lab = p.labId && DB.get('labs', p.labId); if (!lab) return { label: '', cls: '' };
  const last = (lab.notified || []).slice(-1)[0], cs = DB.data.confirmations.filter(c => c.labId === lab.id);
  if (cs.length && cs.every(c => c.status === 'Confirmed')) return { label: 'Confirmed', cls: 'ok' };
  if (last) return { label: 'Sent ' + fmtDate(last.date), cls: 'acc' };
  return { label: 'Not sent', cls: 'warn' };
}
const noticeBadge = p => { const s = noticeState(p); return s.label && (p.status || 'Planned') !== 'Complete' ? `<div style="margin-top:4px"><span class="badge ${s.cls}">Notice: ${esc(s.label)}</span></div>` : ''; };
// A lab should have been told once the project has a PO or an install date within 60 days.
const noticeDue = p => { const s = (p.status || 'Planned'); if (!p.labId || ['Complete', 'On hold'].includes(s) || noticeState(p).label !== 'Not sent') return false; const t = todayStr(); return PROJECT_STATUS.indexOf(s) >= 2 || (p.installStart && p.installStart <= addMonths(t, 2)); };

function advanceProjects() {
  const t = todayStr(); let n = 0;
  DB.data.projects.slice().forEach(p => {
    const cur = p.status || 'Planned'; if (cur === 'On hold') return;
    let target = 0;
    if (p.quoteDate || p.quoteNo) target = 1; if (p.poNo || p.poDate) target = 2;
    if (p.deliveryDate && p.deliveryDate <= t) target = 3; if (p.installStart && p.installStart <= t) target = 5; if (p.installEnd && p.installEnd <= t) target = 6;
    if (target > PROJECT_STATUS.indexOf(cur)) { DB.put('projects', { ...p, status: PROJECT_STATUS[target] }); n++; }
  });
  if (n) DB.log(`Moved ${n} project${n > 1 ? 's' : ''} forward from their dates`);
}

function closeOutProjects() {
  DB.data.projects.slice().forEach(p => {
    if ((p.status || 'Planned') !== 'Complete' || p.closedOut || !p.labId) return;
    const lab = DB.get('labs', p.labId); if (!lab) return;
    const date = p.installEnd || todayStr(), end = fyRange(p.fy || fiscalYear(todayStr()))[1], nm = p.newModelId && DB.get('models', p.newModelId);
    const lines = DB.data.hardware.filter(l => l.labId === lab.id && isActiveLine(l) && (plannedDate(l) || '9999') <= end);
    lines.forEach(l => {
      const history = [...(l.history || []), { date: l.lastReplaced || l.purchaseDate || '', model: modelName(l), qty: l.qty, unitCost: unitCostOf(l), funding: l.fundingSource || '', by: DB.user }];
      const ch = { ...l, history, lastReplaced: date, purchaseDate: date, plannedOverride: '', status: 'In service', warrantyEnd: '', fundingSource: p.fundingSource || l.plannedFunding || l.fundingSource || '', fundingRef: p.poNo || l.fundingRef || '', plannedFunding: '' };
      if (nm) { ch.modelId = nm.id; ch.platform = nm.platform || l.platform; if (+nm.unitCost) ch.unitCost = nm.unitCost; if (nm.os) ch.os = nm.os; }
      DB.put('hardware', ch);
    });
    DB.put('projects', { ...p, closedOut: { date, lines: lines.length, by: DB.user } });
    DB.log(`Project “${p.title}” complete: updated ${lines.length} hardware line(s) in ${labLabel(lab)} (replaced ${fmtDate(date)})`);
    toast(`${labLabel(lab)}: ${lines.length} hardware line(s) marked replaced`);
  });
}

function defaultBaselines() {
  DB.data.labs.slice().forEach(lab => {
    if (lab.baselineId || lab.status === 'Closed') return;
    const plats = new Set(DB.data.hardware.filter(l => l.labId === lab.id && isActiveLine(l)).map(platformOf)); if (plats.size !== 1) return;
    const bs = DB.data.baselines.filter(b => b.platform === [...plats][0]); if (bs.length === 1) DB.put('labs', { ...lab, baselineId: bs[0].id });
  });
}

let AUTOMATING = false;
function syncAutoProjects() {
  if (AUTOMATING || DB.readOnly || DB.confirmOnly || !DB.data.hardware.length) return;
  AUTOMATING = true;
  try { relinkDevices(true); createAutoProjects(); suggestInstallWindows(); advanceProjects(); closeOutProjects(); defaultBaselines(); } finally { AUTOMATING = false; }
}

// Extra lines for the dashboard "needs attention" list.
function automationAlerts() {
  const t = todayStr(), a = [], open = DB.data.projects.filter(p => !['Complete', 'On hold'].includes(p.status || 'Planned'));
  const noq = open.filter(p => p.poNo && !p.quoteLink && !/quote/i.test(p.docLinks || '')).length; if (noq) a.push(['', `${noq} project(s) have a PO number but no quote linked`, '#/projects']);
  const noi = DB.data.projects.filter(p => (p.status === 'Complete') && !p.invoiceLink).length; if (noi) a.push(['', `${noi} completed project(s) have no invoice linked`, '#/projects']);
  const nd = open.filter(noticeDue).length; if (nd) a.push(['warn', `${nd} replacement project(s) have a lab whose contacts haven’t been emailed yet`, '#/projects']);
  const stalled = open.filter(p => (p.status || 'Planned') !== 'Planned' && p._u && daysBetween(p._u.slice(0, 10), t) > 45).length; if (stalled) a.push(['warn', `${stalled} project(s) haven’t been updated in over 45 days`, '#/projects']);
  const tf = DB.data.techProjects, due = tf.filter(x => x.reportDue && !x.reportSubmitted && x.reportDue <= addMonths(t, 1)).length; if (due) a.push(['warn', `${due} Tech Fee project report(s) are due within a month`, '#/techfee']);
  const wait = tf.filter(x => ['Submitted', 'Under review'].includes(x.status) && x.submittedDate && daysBetween(x.submittedDate, t) > 45).length; if (wait) a.push(['', `${wait} Tech Fee proposal(s) have waited over 45 days for a decision`, '#/techfee']);
  const nw = DB.data.devices.filter(d => d.serial && !d.warrantyEnd && /lenovo|apple/i.test((d.manufacturer || '') + ' ' + (d.model || '')) && devStatus(d) !== 'Archived').length;
  if (nw) a.push(['', `${nw} Lenovo / Apple device(s) have no warranty date – Import → Warranty dates builds the lookup file (drop the results in the imports folder to apply them automatically)`, '#/import']);
  return a;
}
