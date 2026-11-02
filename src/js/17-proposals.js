// Funding proposals (e.g. Tech fee requests): auto-built justification document + status tracking.
const PROPOSAL_STATUS = ['Draft', 'Submitted', 'Approved', 'Partially approved', 'Denied'];
function proposalData(p) {
  const t = todayStr(), fyEnd = fyRange(p.fy || fiscalYear(t))[1], since = addMonths(t, -12);
  const labs = (p.labIds || []).map(id => DB.get('labs', id)).filter(Boolean).map(lab => {
    const all = (linesByLab().get(lab.id) || []).filter(isActiveLine); let lines = p.allLines ? all : all.filter(l => plannedDate(l) && plannedDate(l) <= fyEnd); if (!lines.length) lines = all;
    const qty = sum(lines, l => +l.qty || 0), devs = devicesByLab().get(lab.id) || [], known = devs.filter(d => d.warrantyEnd), reps = DB.data.maintenances.filter(m => m.labId === lab.id && m.type === 'Repair' && (m.startDate || '') >= since);
    const ages = lines.filter(l => ageBase(l)).map(l => ({ y: yearsBetween(ageBase(l), t), q: +l.qty || 0 })), life = lines.length ? sum(lines, l => lifecycleYears(l) * (+l.qty || 0)) / (qty || 1) : 0;
    return {
      lab, lines, qty, cost: sum(lines, lineCost), age: ages.length ? sum(ages, a => a.y * a.q) / (sum(ages, a => a.q) || 1) : 0, life,
      pastLife: qty ? sum(lines.filter(l => lineState(l) === 'Overdue'), l => +l.qty || 0) / qty : 0, warrExpired: known.filter(d => d.warrantyEnd < t).length, warrKnown: known.length,
      repairs: reps.length, repairCost: sum(reps, m => +m.cost || 0), osBad: devs.filter(d => osState(d) === 'Unsupported').length, osStuck: devs.filter(d => osState(d) && modelCannotUpgrade(d)).length,
      funding: [...new Set(all.map(l => l.fundingSource).filter(Boolean))], sw: softwareForLab(lab.id).map(x => x.sw.name).sort(), managed: devs.length
    };
  });
  const byModel = group(labs.flatMap(l => l.lines), l => l.modelId || modelName(l));
  const models = [...byModel].map(([, ls]) => ({ name: modelName(ls[0]), spec: modelSpec(getModel(ls[0])), qty: sum(ls, l => +l.qty || 0), unit: unitCostOf(ls[0]), cost: sum(ls, lineCost) }));
  const sub = sum(models, m => m.cost), cont = sub * (+p.contingencyPct || 0) / 100, ship = sub * (+p.shippingPct || 0) / 100;
  return { labs, models, sub, cont, ship, total: sub + cont + ship, qty: sum(labs, l => l.qty) };
}
const proposalTotal = p => proposalData(p).total;
function labNarrative(d) {
  const n = labLabel(d.lab).replace(' · ', ' – ');
  let s = `${n} has ${d.qty} computer${d.qty === 1 ? '' : 's'} in this request, averaging ${d.age.toFixed(1)} years in service against a planned ${d.life.toFixed(0)}-year lifecycle${d.pastLife ? `; ${Math.round(d.pastLife * 100)}% are already past their planned replacement date` : ''}.`;
  if (d.warrKnown) s += ` ${d.warrExpired} of ${d.warrKnown} devices with recorded coverage are out of warranty.`;
  if (d.repairs) s += ` ${d.repairs} repair${d.repairs === 1 ? '' : 's'} were logged in the last 12 months${d.repairCost ? ` (${money(d.repairCost)})` : ''}.`;
  if (d.osBad) s += ` ${d.osBad} device${d.osBad === 1 ? ' runs' : 's run'} an operating system that is no longer supported${d.osStuck ? `, and ${d.osStuck} cannot be upgraded on current hardware` : ''}.`;
  if (d.lab.usage?.util != null) s += ` LabStats shows ${pct(d.lab.usage.util)} utilization (${fmtNum(d.lab.usage.hours)} hours, ${fmtNum(d.lab.usage.sessions)} sessions, ${d.lab.usage.period || ''}).`;
  return s;
}
function proposalHTML(p) {
  const D = proposalData(p), tpl = Object.assign({}, DEFAULT_SETTINGS.proposalTemplate, S().proposalTemplate || {}), th = 'style="border:1px solid #bbb;background:#eee;padding:5px 8px;text-align:left;font-size:12px"', td = 'style="border:1px solid #ccc;padding:5px 8px;font-size:13px;vertical-align:top"', tdr = 'style="border:1px solid #ccc;padding:5px 8px;font-size:13px;text-align:right"';
  const avgAge = D.qty ? sum(D.labs, l => l.age * l.qty) / D.qty : 0, past = D.qty ? sum(D.labs, l => l.pastLife * l.qty) / D.qty : 0;
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1d2736;max-width:860px;line-height:1.45;font-size:14px">
  <p style="color:#666;font-size:12px;margin:0">${esc(S().orgName || '')}</p><h1 style="font-size:22px;margin:2px 0">${esc(p.title || 'Lab replacement request')}</h1>
  <p style="color:#555;margin:0 0 12px">Fiscal year ${p.fy ? 'FY' + p.fy : ''} · Funding requested: <b>${esc(p.source || '—')}</b>${p.projectRef ? ' · Ref ' + esc(p.projectRef) : ''}<br>Prepared ${fmtDate(todayStr())}${p.requestor ? ' by ' + esc(p.requestor) : ''}${p.department ? ', ' + esc(p.department) : ''}</p>
  <h2 style="font-size:16px;border-bottom:2px solid #512d6d;padding-bottom:3px">Summary</h2><p>${esc(tpl.intro).replace(/\n/g, '<br>')}</p>
  <p><b>Request:</b> ${money(D.total)} to replace <b>${D.qty}</b> computers in <b>${D.labs.length}</b> lab${D.labs.length === 1 ? '' : 's'}. Average age of the equipment is <b>${avgAge.toFixed(1)} years</b>${past ? `, and <b>${Math.round(past * 100)}%</b> is past its planned replacement date` : ''}.</p>
  ${p.extra ? `<p>${esc(p.extra).replace(/\n/g, '<br>')}</p>` : ''}
  <h2 style="font-size:16px;border-bottom:2px solid #512d6d;padding-bottom:3px">Justification by lab</h2>
  ${D.labs.map(d => `<h3 style="font-size:14px;margin:14px 0 2px">${esc(labLabel(d.lab))} <span style="font-weight:400;color:#666">— ${esc(DB.get('buildings', d.lab.buildingId)?.name || '')}${d.lab.department ? ', ' + esc(d.lab.department) : ''}</span></h3><p style="margin:2px 0">${esc(labNarrative(d))}</p>
    <p style="margin:2px 0;font-size:13px"><b>Software to support:</b> ${d.sw.length ? esc(d.sw.join(', ')) : 'to be confirmed'}${d.funding.length ? `<br><b>Previously funded by:</b> ${esc(d.funding.join(', '))}` : ''}</p>`).join('')}
  <h2 style="font-size:16px;border-bottom:2px solid #512d6d;padding-bottom:3px;margin-top:18px">Cost estimate</h2>
  <table style="border-collapse:collapse;width:100%"><tr><th ${th}>Model / configuration</th><th ${th}>Specifications</th><th ${th}>Qty</th><th ${th}>Unit</th><th ${th}>Total</th></tr>${D.models.map(m => `<tr><td ${td}>${esc(m.name)}</td><td ${td}>${esc(m.spec || '—')}</td><td ${tdr}>${m.qty}</td><td ${tdr}>${money(m.unit)}</td><td ${tdr}>${money(m.cost)}</td></tr>`).join('')}
  <tr><td ${td} colspan="4"><b>Subtotal</b></td><td ${tdr}>${money(D.sub)}</td></tr>${D.cont ? `<tr><td ${td} colspan="4">Contingency (${p.contingencyPct}%)</td><td ${tdr}>${money(D.cont)}</td></tr>` : ''}${D.ship ? `<tr><td ${td} colspan="4">Shipping / handling (${p.shippingPct}%)</td><td ${tdr}>${money(D.ship)}</td></tr>` : ''}<tr><td ${td} colspan="4"><b>Total request</b></td><td ${tdr}><b>${money(D.total)}</b></td></tr></table>
  <h2 style="font-size:16px;border-bottom:2px solid #512d6d;padding-bottom:3px;margin-top:18px">Risk of deferral</h2><p>${esc(tpl.risk).replace(/\n/g, '<br>')}</p>
  ${p.notes ? `<h2 style="font-size:16px;border-bottom:2px solid #512d6d;padding-bottom:3px">Notes</h2><p>${esc(p.notes).replace(/\n/g, '<br>')}</p>` : ''}</div>`;
}
const docPage = (title, inner) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="margin:24px">${inner}</body></html>`;

VIEWS.proposals = {
  render(el) {
    el.innerHTML = pageHead('Proposals', `<button class="btn primary edit-only" id="np">${ic('plus')} New proposal</button>`) + `<p class="muted small" style="margin-top:-8px">Funding requests such as Tech fee proposals. The document is generated from your data – age, warranty, repairs, usage, OS support, software and costs – and you track its status and approved amount here.</p><div id="t"></div>`;
    mountTable($('#t', el), {
      id: 'proposals', csvName: 'proposals', rows: () => DB.data.proposals, rowId: r => r.id, onRow: id => location.hash = '#/proposal/' + id, defaultSort: { k: 'fy', dir: 'desc' }, empty: 'No proposals yet. Create one here or from the Budget planner.',
      filters: [{ k: 's', label: 'Status', options: () => PROPOSAL_STATUS, test: (r, v) => r.status === v }],
      cols: [{ k: 'title', label: 'Title', val: r => r.title }, { k: 'fy', label: 'FY', val: r => r.fy || 0, html: r => r.fy ? 'FY' + r.fy : '' }, { k: 'src', label: 'Funding', val: r => r.source }, { k: 'labs', label: 'Labs', val: r => (r.labIds || []).length, num: true },
      { k: 'total', label: 'Requested', val: proposalTotal, html: r => money(proposalTotal(r)), num: true }, { k: 'appr', label: 'Approved', val: r => +r.approvedAmount || 0, html: r => r.approvedAmount != null && r.approvedAmount !== '' ? money(r.approvedAmount) : '—', num: true },
      { k: 'st', label: 'Status', val: r => r.status, html: r => `<span class="badge ${{ Approved: 'ok', 'Partially approved': 'warn', Denied: 'bad', Submitted: 'info' }[r.status] || ''}">${esc(r.status || 'Draft')}</span>` }]
    });
    $('#np', el).onclick = () => { const p = DB.put('proposals', { title: 'New lab replacement request', fy: fiscalYear(todayStr()) + 1, source: 'Tech fee project', status: 'Draft', labIds: [], contingencyPct: 5, shippingPct: 0, requestor: DB.user }); location.hash = '#/proposal/' + p.id; };
  }
};
VIEWS.proposal = {
  render(el, id) {
    const p = DB.get('proposals', id); if (!p) { el.innerHTML = pageHead('Proposal not found') + '<a href="#/proposals">Back</a>'; return; }
    const F = (k, label, type = 'text', extra = '') => `<div class="field${type === 'textarea' ? ' wide' : ''}"><label>${label}</label>${type === 'textarea' ? `<textarea data-f="${k}" rows="3">${esc(p[k] ?? '')}</textarea>` : `<input type="${type}" data-f="${k}" value="${esc(p[k] ?? '')}" ${extra}>`}</div>`;
    const byB = group(DB.data.labs, l => DB.get('buildings', l.buildingId)?.name || '?');
    el.innerHTML = pageHead(p.title || 'Proposal', `<button class="btn" id="pp-print">Print / PDF</button><button class="btn" id="pp-copy">Copy for Word</button><button class="btn" id="pp-doc">Download .doc</button><button class="btn danger edit-only" id="pp-del">Delete</button>`, `<a href="#/proposals">Proposals</a> › ${esc(p.title || '')}`) + `
    <div class="split" style="grid-template-columns:380px minmax(0,1fr)"><div><div class="card"><h3>Details</h3><div class="form-grid">${F('title', 'Title')}${F('fy', 'Fiscal year (e.g. 2028)', 'number')}
      <div class="field"><label>Funding source</label><select data-f="source">${optionsHTML(fundingOptions(), p.source)}</select></div><div class="field"><label>Status</label><select data-f="status">${optionsHTML(PROPOSAL_STATUS, p.status || 'Draft')}</select></div>
      ${F('requestor', 'Requestor')}${F('department', 'Department')}${F('projectRef', 'Project / reference no.')}${F('approvedAmount', 'Approved amount', 'number')}${F('contingencyPct', 'Contingency %', 'number')}${F('shippingPct', 'Shipping %', 'number')}
      <label class="chk wide" style="grid-column:1/3"><input type="checkbox" data-f="allLines"${p.allLines ? ' checked' : ''}> Include all hardware in each lab (not only lines due by the end of the year)</label>
      ${F('extra', 'Extra paragraph (appears in the summary)', 'textarea')}${F('notes', 'Notes', 'textarea')}</div></div>
      <div class="card"><h3>Labs in this request</h3><div style="max-height:320px;overflow:auto">${[...byB].map(([b, ls]) => `<div class="small muted" style="margin-top:6px">${esc(b)}</div>${ls.sort((a, c) => cmp(labLabel(a), labLabel(c))).map(l => `<label class="chk"><input type="checkbox" data-lab="${l.id}"${(p.labIds || []).includes(l.id) ? ' checked' : ''}> ${esc(labLabel(l))}</label>`).join('')}`).join('')}</div></div></div>
      <div class="card" style="background:#fff"><div id="pp-doc-view"></div></div></div>`;
    let tm; const refresh = () => { $('#pp-doc-view', el).innerHTML = proposalHTML(DB.get('proposals', id)); };
    const upd = patch => { DB.put('proposals', { ...DB.get('proposals', id), ...patch }); clearTimeout(tm); tm = setTimeout(refresh, 200); };
    el.addEventListener('input', e => { const f = e.target.dataset.f; if (f && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') upd({ [f]: e.target.type === 'number' ? (e.target.value === '' ? null : +e.target.value) : e.target.value }); });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.lab) { const cur = new Set(DB.get('proposals', id).labIds || []); t.checked ? cur.add(t.dataset.lab) : cur.delete(t.dataset.lab); upd({ labIds: [...cur] }); }
      else if (t.dataset.f && t.type === 'checkbox') upd({ [t.dataset.f]: t.checked }); else if (t.dataset.f && t.tagName === 'SELECT') upd({ [t.dataset.f]: t.value });
    });
    const doc = () => proposalHTML(DB.get('proposals', id)), nm = () => (DB.get('proposals', id).title || 'proposal').replace(/[^\w\-]+/g, '_');
    $('#pp-print', el).onclick = () => { const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print, or use Download .doc', 'err'); w.document.write(docPage(p.title, doc())); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); };
    $('#pp-doc', el).onclick = () => download(nm() + '.doc', docPage(p.title, doc()), 'application/msword');
    $('#pp-copy', el).onclick = async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([doc()], { type: 'text/html' }) })]); toast('Copied – paste into Word'); } catch { const r = document.createRange(); r.selectNodeContents($('#pp-doc-view', el)); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy'); toast('Copied – paste into Word'); } };
    $('#pp-del', el).onclick = () => { if (confirm('Delete this proposal?')) { DB.remove('proposals', id); DB.log('Deleted proposal ' + p.title); location.hash = '#/proposals'; } };
    refresh();
  }
};
function proposalFromPlanner(R) {
  const fys = R.fys.map(String), body = document.createElement('div');
  body.innerHTML = `<div class="form-grid"><div class="field"><label>Fiscal year</label><select id="pf-fy">${optionsHTML(fys.map(f => ({ v: f, l: 'FY' + f })))}</select></div><div class="field"><label>Funding source</label><select id="pf-src"><option value="">Any</option>${optionsHTML([...new Set(R.items.map(i => i.src))])}</select></div></div><p class="small muted">Creates a proposal containing every lab the planner schedules in that year and source.</p>`;
  modal({ title: 'Build proposal from schedule', body, buttons: [{ label: 'Cancel' }, { label: 'Create', cls: 'primary', onClick: () => {
    const fy = +$('#pf-fy', body).value, src = $('#pf-src', body).value, its = R.items.filter(i => i.fy === fy && (!src || i.src === src)); if (!its.length) { toast('The planner schedules nothing there.', 'err'); return false; }
    const p = DB.put('proposals', { title: `FY${fy} lab replacement${src ? ' – ' + src : ''}`, fy, source: src || 'Replacement budget', status: 'Draft', labIds: [...new Set(its.map(i => i.l.labId))], contingencyPct: 5, shippingPct: 0, requestor: DB.user }); location.hash = '#/proposal/' + p.id;
  } }] });
}
