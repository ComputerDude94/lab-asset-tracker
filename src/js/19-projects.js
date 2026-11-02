// Replacement projects: quote -> PO -> delivery -> imaging -> install, with blackout windows (academic calendar).
const PROJECT_STATUS = ['Planned', 'Quoting', 'PO issued', 'Delivered', 'Imaging', 'Installing', 'Complete', 'On hold'];
const blackoutText = () => (S().blackouts || []).map(b => `${b.label} | ${b.start} | ${b.end}`).join('\n');
const parseBlackouts = t => t.split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0] && /^\d{4}-\d{2}-\d{2}$/.test(p[1] || '') && /^\d{4}-\d{2}-\d{2}$/.test(p[2] || '')).map(p => ({ label: p[0], start: p[1], end: p[2] }));
function blackoutHit(p) { const s = p.installStart, e = p.installEnd || p.installStart; if (!s) return ''; const b = (S().blackouts || []).find(b => s <= b.end && e >= b.start); return b ? b.label : ''; }
SCHEMA.project = {
  title: 'Project', table: 'projects', wide: true, defaults: () => ({ status: 'Planned', fy: fiscalYear(todayStr()) }),
  fields: [
    { k: 'title', label: 'Title', req: true, wide: true }, { k: 'labId', label: 'Lab', type: 'select', options: labOptions }, { k: 'fy', label: 'Fiscal year', type: 'number' },
    { k: 'status', label: 'Status', type: 'select', req: true, options: PROJECT_STATUS }, { k: 'owner', label: 'Owner' }, { k: 'vendor', label: 'Vendor' }, { k: 'quoteNo', label: 'Quote #' }, { k: 'poNo', label: 'PO #' }, { k: 'amount', label: 'Amount', type: 'number', min: 0 },
    { k: 'proposalId', label: 'Proposal', type: 'select', options: () => DB.data.proposals.map(p => ({ v: p.id, l: p.title })) },
    { k: 'quoteDate', label: 'Quote date', type: 'date' }, { k: 'poDate', label: 'PO date', type: 'date' }, { k: 'deliveryDate', label: 'Delivery date', type: 'date' }, { k: 'installStart', label: 'Install start', type: 'date' }, { k: 'installEnd', label: 'Install end', type: 'date' },
    { k: 'docLinks', label: 'Links to quotes / PO / invoices (one per line)', type: 'textarea', wide: true }, { k: 'notes', label: 'Notes', type: 'textarea', wide: true }]
};
VIEWS.projects = {
  render(el) {
    const tab = UI.projTab || 'board', list = DB.data.projects;
    el.innerHTML = pageHead('Replacement projects', `<button class="btn primary edit-only" id="npj">${ic('plus')} New project</button>`) + `<div class="tabs">${[['board', 'Board'], ['table', 'Table'], ['timeline', 'Install timeline']].map(([k, l]) => `<a data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div><div id="t"></div>`;
    const host = $('#t', el), lab = p => p.labId ? labLabel(DB.get('labs', p.labId)) : '';
    const warn = p => { const b = blackoutHit(p); return b ? `<span class="badge bad" title="Install overlaps a blackout window">⚠ ${esc(b)}</span>` : ''; };
    if (tab === 'board') {
      host.innerHTML = `<div style="display:grid;grid-auto-flow:column;grid-auto-columns:minmax(230px,1fr);gap:12px;overflow:auto;padding-bottom:8px">${PROJECT_STATUS.map(s => { const ps = list.filter(p => (p.status || 'Planned') === s); return `<div><div class="small muted" style="margin-bottom:6px"><b>${s}</b> · ${ps.length}${ps.length ? ' · ' + money(sum(ps, p => +p.amount || 0)) : ''}</div>${ps.map(p => `<div class="card" style="padding:10px;margin-bottom:8px"><b data-e="${p.id}" style="cursor:pointer">${esc(p.title)}</b><div class="small muted">${esc(lab(p))}</div><div class="small">${p.amount ? money(p.amount) : ''} ${esc(p.vendor || '')}</div><div class="small muted">${p.installStart ? 'Install ' + fmtDate(p.installStart) + (p.installEnd ? ' – ' + fmtDate(p.installEnd) : '') : ''}</div>${warn(p)}<div class="chips edit-only" style="margin-top:6px"><button class="btn sm" data-mv="${p.id}|-1"${PROJECT_STATUS.indexOf(s) === 0 ? ' disabled' : ''}>‹</button><button class="btn sm" data-mv="${p.id}|1"${PROJECT_STATUS.indexOf(s) >= 6 ? ' disabled' : ''}>›</button></div></div>`).join('')}</div>`; }).join('')}</div>`;
    } else if (tab === 'table') {
      mountTable(host, {
        id: 'projects', csvName: 'projects', rows: () => list, rowId: r => r.id, onRow: id => editEntity('project', id), defaultSort: { k: 'inst', dir: 'asc' },
        filters: [{ k: 's', label: 'Status', options: () => PROJECT_STATUS, test: (r, v) => (r.status || 'Planned') === v }, { k: 'fy', label: 'FY', options: () => [...new Set(list.map(p => String(p.fy || '')))].filter(Boolean), test: (r, v) => String(r.fy) === v }],
        cols: [{ k: 'title', label: 'Project', val: r => r.title }, { k: 'lab', label: 'Lab', val: lab }, { k: 'fy', label: 'FY', val: r => r.fy || 0, html: r => r.fy ? 'FY' + r.fy : '' }, { k: 'st', label: 'Status', val: r => r.status, html: r => `<span class="badge acc">${esc(r.status || 'Planned')}</span>` },
        { k: 'vendor', label: 'Vendor', val: r => r.vendor }, { k: 'po', label: 'PO', val: r => r.poNo }, { k: 'amt', label: 'Amount', val: r => +r.amount || 0, html: r => money(r.amount), num: true },
        { k: 'inst', label: 'Install', val: r => r.installStart || '', html: r => r.installStart ? fmtDate(r.installStart) + (r.installEnd ? ' – ' + fmtDate(r.installEnd) : '') + ' ' + warn(r) : '—' }, { k: 'own', label: 'Owner', val: r => r.owner }]
      });
    } else {
      const fy = UI.projFY || fiscalYear(todayStr()), [s, e] = fyRange(fy), months = Array.from({ length: 12 }, (_, i) => addMonths(s, i)), ps = list.filter(p => p.installStart && p.installStart <= e && (p.installEnd || p.installStart) >= s);
      const col = d => Math.max(0, Math.min(11, months.findIndex((m, i) => d < (months[i + 1] || '9999')))) + 1;
      host.innerHTML = `<div class="toolbar"><div class="field"><label>Fiscal year</label><select id="tl-fy">${[fy - 1, fy, fy + 1, fy + 2].map(f => `<option value="${f}"${f === fy ? ' selected' : ''}>FY${f}</option>`).join('')}</select></div></div>
      <div class="tbl-wrap" style="padding:8px"><div style="display:grid;grid-template-columns:200px repeat(12,minmax(48px,1fr));gap:2px;font-size:12px"><div></div>${months.map(m => `<div class="muted" style="text-align:center">${new Date(m + 'T12:00').toLocaleString(undefined, { month: 'short' })}</div>`).join('')}
      <div class="muted" style="align-self:center">Blackout windows</div><div style="grid-column:2/14;display:grid;grid-template-columns:repeat(12,1fr);gap:2px;height:16px">${(S().blackouts || []).filter(b => b.start <= e && b.end >= s).map(b => `<div title="${esc(b.label)}" style="grid-column:${col(b.start < s ? s : b.start)}/${col(b.end > e ? e : b.end) + 1};background:var(--danger-soft);border-radius:3px"></div>`).join('')}</div>
      ${ps.map(p => `<div style="padding:4px 0">${esc(p.title)}<div class="muted">${esc(lab(p))}</div></div><div style="grid-column:2/14;display:grid;grid-template-columns:repeat(12,1fr);gap:2px;align-items:center"><div data-e="${p.id}" title="${esc(p.title)}" style="cursor:pointer;grid-column:${col(p.installStart < s ? s : p.installStart)}/${col((p.installEnd || p.installStart) > e ? e : (p.installEnd || p.installStart)) + 1};height:20px;border-radius:4px;background:${blackoutHit(p) ? 'var(--danger)' : 'var(--accent)'}"></div></div>`).join('') || '<div style="grid-column:1/14" class="empty">No installs scheduled this year. Set Install start/end on a project.</div>'}</div></div>`;
      $('#tl-fy', host)?.addEventListener('change', e => { UI.projFY = +e.target.value; render(); });
    }
    el.onclick = e => {
      const t = e.target, tb = t.closest('[data-tab]'); if (tb) { UI.projTab = tb.dataset.tab; return render(); }
      const mv = t.closest('[data-mv]'); if (mv) { const [id, d] = mv.dataset.mv.split('|'), p = DB.get('projects', id), i = PROJECT_STATUS.indexOf(p.status || 'Planned'); DB.put('projects', { ...p, status: PROJECT_STATUS[Math.max(0, Math.min(6, i + +d))] }); return render(); }
      const ed = t.closest('[data-e]'); if (ed) editEntity('project', ed.dataset.e);
      if (t.closest('#npj')) editEntity('project');
    };
  }
};
function projectsFromPlanner(R) {
  const body = document.createElement('div');
  body.innerHTML = `<div class="field"><label>Fiscal year</label><select id="pj-fy">${optionsHTML(R.fys.map(f => ({ v: f, l: 'FY' + f })))}</select></div><p class="small muted">Creates one project per lab the planner schedules in that year (skipping labs that already have a project for it).</p>`;
  modal({ title: 'Create projects from schedule', body, buttons: [{ label: 'Cancel' }, { label: 'Create', cls: 'primary', onClick: () => {
    const fy = +$('#pj-fy', body).value, by = group(R.items.filter(i => i.fy === fy), i => i.l.labId); let n = 0;
    by.forEach((its, labId) => { if (DB.data.projects.some(p => p.labId === labId && p.fy === fy)) return; DB.put('projects', { title: `${labLabel(DB.get('labs', labId))} replacement FY${fy}`, labId, fy, status: 'Planned', amount: Math.round(sum(its, i => i.cost)), owner: DB.user }); n++; });
    DB.log(`Created ${n} replacement projects for FY${fy}`); toast(`Created ${n} project(s)`); UI.projTab = 'board'; location.hash = '#/projects';
  } }] });
}
