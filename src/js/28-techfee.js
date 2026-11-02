// Tech Fee projects: new initiatives funded from the Technology Fee (proposal -> decision -> delivery -> report).
// These are separate from Tech Fee *replacements*, which follow a lab's hardware lifecycle (funding source "Tech fee replacement").
const TF_STATUS = ['Idea', 'Proposal drafted', 'Submitted', 'Under review', 'Approved', 'Funded', 'In progress', 'Complete', 'Denied', 'On hold'];
SCHEMA.techProject = {
  title: 'Tech Fee project', table: 'techProjects', wide: true, defaults: () => ({ status: 'Idea', fy: fiscalYear(todayStr()) }),
  fields: [
    { k: 'title', label: 'Project title', req: true, wide: true }, { k: 'department', label: 'Requesting department' }, { k: 'contactId', label: 'Requester / sponsor', type: 'select', options: contactOptions },
    { k: 'fy', label: 'Fiscal year', type: 'number' }, { k: 'status', label: 'Status', type: 'select', req: true, options: TF_STATUS },
    { k: 'requested', label: 'Amount requested', type: 'number', min: 0 }, { k: 'awarded', label: 'Amount awarded', type: 'number', min: 0 }, { k: 'spent', label: 'Spent so far', type: 'number', min: 0 },
    { k: 'labIds', label: 'Labs / rooms affected', type: 'multi', wide: true, options: labOptions },
    { k: 'proposalId', label: 'Proposal document', type: 'select', options: () => DB.data.proposals.map(p => ({ v: p.id, l: p.title })) }, { k: 'poNo', label: 'PO #' },
    { k: 'submittedDate', label: 'Submitted', type: 'date' }, { k: 'decisionDate', label: 'Decision date', type: 'date' }, { k: 'startDate', label: 'Start', type: 'date' }, { k: 'endDate', label: 'Target completion', type: 'date' },
    { k: 'reportDue', label: 'Report due', type: 'date' }, { k: 'reportSubmitted', label: 'Report submitted', type: 'check' },
    { k: 'deliverables', label: 'Deliverables / scope', type: 'textarea', wide: true }, { k: 'outcome', label: 'Outcome / results', type: 'textarea', wide: true },
    { k: 'docLinks', label: 'Links (proposal, quotes, report – one per line)', type: 'textarea', wide: true }, { k: 'notes', label: 'Notes', type: 'textarea', wide: true }]
};
VIEWS.techfee = {
  render(el) {
    const all = DB.data.techProjects, fys = [...new Set([fiscalYear(todayStr()), ...all.map(p => +p.fy).filter(Boolean)])].sort((a, b) => b - a), fy = UI.tfFY && fys.includes(UI.tfFY) ? UI.tfFY : fys[0], tab = UI.tfTab || 'board';
    const list = all.filter(p => +p.fy === fy), live = list.filter(p => !['Denied', 'Idea'].includes(p.status)), spentOf = p => +p.spent || 0;
    const [fs, fe] = fyRange(fy), repl = DB.data.hardware.filter(l => isActiveLine(l) && plannedFundingOf(l) === 'Tech fee replacement' && (plannedDate(l) || '') >= fs && (plannedDate(l) || '') <= fe);
    el.innerHTML = pageHead('Tech Fee projects', `<button class="btn primary edit-only" id="ntf">${ic('plus')} New Tech Fee project</button>`) +
      `<p class="muted small">New initiatives you propose for Technology Fee funding. Routine lab refreshes paid by the Tech Fee are <b>Tech Fee replacements</b>: set a hardware line’s planned funding to “Tech fee replacement” and they show on the replacement plan and in the card below, not here.</p>
      <div class="toolbar"><div class="field"><label>Fiscal year</label><select id="tf-fy">${fys.map(f => `<option value="${f}"${f === fy ? ' selected' : ''}>FY${f}</option>`).join('')}</select></div></div>
      <div class="kpis"><div class="kpi"><div class="v">${money(sum(list, p => +p.requested || 0))}</div><div class="l">Requested</div><div class="s">${list.length} project(s)</div></div>
      <div class="kpi"><div class="v">${money(sum(live, p => +p.awarded || 0))}</div><div class="l">Awarded</div></div>
      <div class="kpi"><div class="v">${money(sum(live, spentOf))}</div><div class="l">Spent</div></div>
      <div class="kpi"><div class="v">${money(sum(live, p => (+p.awarded || 0) - spentOf(p)))}</div><div class="l">Remaining</div></div>
      <div class="kpi"><div class="v">${money(sum(repl, lineCost))}</div><div class="l">Tech Fee replacements planned</div><div class="s">${fmtNum(sum(repl, l => +l.qty || 0))} devices in FY${fy}</div></div></div>
      <div class="tabs">${[['board', 'Board'], ['table', 'Table']].map(([k, l]) => `<a data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div><div id="t"></div>`;
    const host = $('#t', el), labs = p => (p.labIds || []).map(id => labLabel(DB.get('labs', id))).join(', ');
    const overdue = p => p.reportDue && !p.reportSubmitted && p.reportDue < todayStr() ? '<span class="badge bad">report overdue</span>' : p.reportDue && !p.reportSubmitted ? `<span class="badge warn">report due ${esc(fmtDate(p.reportDue))}</span>` : '';
    if (tab === 'board') {
      host.innerHTML = `<div style="display:grid;grid-auto-flow:column;grid-auto-columns:minmax(220px,1fr);gap:12px;overflow:auto;padding-bottom:8px">${TF_STATUS.map(s => { const ps = list.filter(p => p.status === s); return `<div class="kcol" data-col="${s}"><div class="small muted" style="margin-bottom:6px"><b>${s}</b> · ${ps.length}</div>${ps.map(p => `<div class="card kcard" draggable="true" data-card="${p.id}" style="padding:10px;margin-bottom:8px"><b data-e="${p.id}" style="cursor:pointer">${esc(p.title)}</b><div class="small muted">${esc(p.department || '')}</div><div class="small">${p.awarded ? money(p.awarded) + ' awarded' : p.requested ? money(p.requested) + ' requested' : ''}</div><div class="small muted">${esc(labs(p))}</div>${overdue(p)}<div class="chips edit-only" style="margin-top:6px"><button class="btn sm" data-mv="${p.id}|-1"${TF_STATUS.indexOf(s) === 0 ? ' disabled' : ''}>‹</button><button class="btn sm" data-mv="${p.id}|1"${TF_STATUS.indexOf(s) >= TF_STATUS.length - 1 ? ' disabled' : ''}>›</button></div></div>`).join('')}</div>`; }).join('')}</div>`;
      kanbanDnD(host, 'techProjects', TF_STATUS, '');
    } else {
      mountTable(host, {
        id: 'techfee', csvName: 'tech-fee-projects', rows: () => list, rowId: r => r.id, onRow: id => editEntity('techProject', id), defaultSort: { k: 'title', dir: 'asc' },
        filters: [{ k: 's', label: 'Status', options: () => TF_STATUS, test: (r, v) => r.status === v }],
        cols: [{ k: 'title', label: 'Project', val: r => r.title }, { k: 'dept', label: 'Department', val: r => r.department }, { k: 'st', label: 'Status', val: r => r.status, html: r => `<span class="badge acc">${esc(r.status)}</span>` },
          { k: 'req', label: 'Requested', val: r => +r.requested || 0, html: r => money(r.requested), num: true }, { k: 'aw', label: 'Awarded', val: r => +r.awarded || 0, html: r => money(r.awarded), num: true }, { k: 'sp', label: 'Spent', val: r => +r.spent || 0, html: r => money(r.spent), num: true },
          { k: 'labs', label: 'Labs', val: labs }, { k: 'rep', label: 'Report', val: r => r.reportSubmitted ? 'Submitted' : r.reportDue || '', html: r => r.reportSubmitted ? 'Submitted' : overdue(r) }]
      });
    }
    $('#ntf', el).onclick = () => editEntity('techProject', null, { fy });
    $('#tf-fy', el).onchange = e => { UI.tfFY = +e.target.value; render(); };
    el.onclick = e => {
      const t = e.target, tb = t.closest('[data-tab]'); if (tb) { UI.tfTab = tb.dataset.tab; return render(); }
      const mv = t.closest('[data-mv]'); if (mv) { const [id, d] = mv.dataset.mv.split('|'), p = DB.get('techProjects', id), i = TF_STATUS.indexOf(p.status); DB.put('techProjects', { ...p, status: TF_STATUS[Math.max(0, Math.min(TF_STATUS.length - 1, i + +d))] }); return render(); }
      const ed = t.closest('[data-e]'); if (ed) editEntity('techProject', ed.dataset.e);
    };
  }
};
