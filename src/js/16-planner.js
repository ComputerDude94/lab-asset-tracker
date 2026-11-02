// Budget what-if planner: levels the replacement schedule against budgets per fiscal year and funding source.
const PLAN_DEFAULT = { years: 4, allowSplit: false, overflow: false, pull: 0, month: 1, w: { age: 1, over: 1, war: 0.5, rep: 0.5, use: 0.3, os: 0.7 } };
const plannerOpts = () => UI.planner2 ??= JSON.parse(JSON.stringify(PLAN_DEFAULT));
function lineScore(l, w) {
  const lab = DB.get('labs', l.labId), base = ageBase(l), t = todayStr(), devs = (lab && devicesByLab().get(lab.id)) || [];
  const age = base ? Math.min(2, yearsBetween(base, t) / lifecycleYears(l)) : 0, over = lineState(l) === 'Overdue' ? 1 : 0;
  const known = devs.filter(d => d.warrantyEnd), war = known.length ? known.filter(d => d.warrantyEnd < t).length / known.length : 0;
  const since = addMonths(t, -12), rep = Math.min(1, DB.data.maintenances.filter(m => m.labId === l.labId && m.type === 'Repair' && (m.startDate || '') >= since).length / Math.max(1, (+l.qty || 1) / 5));
  const use = lab?.usage?.util != null ? (lab.usage.util - 50) / 50 : 0, os = lab ? labOsRisk(lab) : 0;
  const parts = { age, over, war, rep, use, os };
  return { score: Object.keys(parts).reduce((a, k) => a + w[k] * parts[k], 0), parts };
}
function buildSchedule(o) {
  const t = todayStr(), fy0 = fiscalYear(t), fys = Array.from({ length: o.years }, (_, i) => fy0 + i), last = fys[fys.length - 1], B = S().budgets || {};
  const sources = [...new Set([...(S().fundingSources || []), 'Replacement budget'])], hasBudget = fys.some(f => Object.values(B['FY' + f] || {}).some(v => +v > 0));
  const rem = {}; fys.forEach(f => { rem[f] = {}; sources.forEach(s => rem[f][s] = hasBudget ? +(B['FY' + f]?.[s]) || 0 : Infinity); });
  const items = [], lines = DB.data.hardware.filter(l => isActiveLine(l) && plannedDate(l) && (+l.qty || 0) > 0);
  const ranked = lines.map(l => { const p = plannedDate(l), nat = Math.max(fy0, fiscalYear(p)); return { l, nat, ...lineScore(l, o.w) }; }).filter(x => x.nat <= last).sort((a, b) => b.score - a.score || cmp(plannedDate(a.l), plannedDate(b.l)));
  for (const x of ranked) {
    const l = x.l, unit = unitCostOf(l) || 0; let left = +l.qty, src0 = plannedFundingOf(l);
    for (let f = Math.max(fy0, x.nat - o.pull); f <= last && left > 0; f++) {
      const order = o.overflow ? [src0, ...sources.filter(s => s !== src0).sort((a, b) => rem[f][b] - rem[f][a])] : [src0];
      for (const s of order) {
        if (!(s in rem[f])) rem[f][s] = hasBudget ? 0 : Infinity;
        const cost = left * unit; let q = 0;
        if (rem[f][s] >= cost) q = left; else if (o.allowSplit && unit > 0 && rem[f][s] >= unit) q = Math.floor(rem[f][s] / unit);
        if (q > 0) { rem[f][s] -= q * unit; items.push({ ...x, fy: f, qty: q, cost: q * unit, src: s, partial: q < +l.qty, moved: s !== src0 }); left -= q; }
        if (left <= 0) break;
      }
    }
    if (left > 0) items.push({ ...x, fy: 'Unfunded', qty: left, cost: left * unit, src: src0, partial: left < +l.qty });
  }
  return { fys, items, hasBudget, rem, sources, B };
}
function lifecycleScenario(years) {
  const t = todayStr(), fy0 = fiscalYear(t), out = {};
  DB.data.hardware.filter(isActiveLine).forEach(l => { const b = ageBase(l); if (!b) return; const f = Math.max(fy0, fiscalYear(addYears(b, years))); out[f] = (out[f] || 0) + lineCost(l); });
  return out;
}
VIEWS.planner = {
  render(el) {
    const o = plannerOpts(), R = buildSchedule(o), { fys, items, hasBudget } = R, cols = [...fys, 'Unfunded'];
    const by = (f, s) => sum(items.filter(i => i.fy === f && (!s || i.src === s)), i => i.cost);
    const srcs = [...new Set(items.map(i => i.src))], unf = items.filter(i => i.fy === 'Unfunded'), deferred = items.filter(i => i.fy !== 'Unfunded' && i.fy > i.nat);
    const budgetOf = f => sum(Object.values(R.B['FY' + f] || {}), v => +v || 0);
    el.innerHTML = pageHead('Budget planner', `<button class="btn" id="pl-csv">Export CSV</button><button class="btn edit-only" id="pl-proj">${ic('tool')} Create projects…</button><button class="btn edit-only" id="pl-prop">${ic('file')} Build proposal…</button><button class="btn primary edit-only" id="pl-apply">Apply schedule to plan</button>`) + `
    <p class="muted small" style="margin-top:-8px">Enter what you can spend each fiscal year per funding source. The planner places labs in order of urgency (age, overdue, warranty, repairs, usage, OS support) into the earliest year that has money left, and shows what slips or can’t be funded. Nothing changes until you press <b>Apply schedule to plan</b>.</p>
    <div class="card"><div class="card-h"><h3>Budgets by fiscal year</h3><span class="spacer"></span><span class="muted small">${hasBudget ? '' : 'No budgets entered yet – showing the natural (unlevelled) schedule'}</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Funding source</th>${fys.map(f => `<th class="num">FY${f}</th>`).join('')}</tr></thead><tbody>${R.sources.map(s => `<tr><td>${esc(s)}</td>${fys.map(f => `<td class="num"><input type="number" min="0" step="1000" style="width:120px;text-align:right" data-b="${f}|${esc(s)}" value="${R.B['FY' + f]?.[s] ?? ''}"></td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><td>Total budget</td>${fys.map(f => `<td class="num">${money(budgetOf(f))}</td>`).join('')}</tr></tfoot></table></div>
      <div class="toolbar" style="margin:12px 0 0"><div class="field"><label>Look ahead (years)</label><select id="o-years">${[2, 3, 4, 5, 6].map(n => `<option${n === o.years ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>Pull forward up to (yrs)</label><select id="o-pull">${[0, 1, 2].map(n => `<option${n === o.pull ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <label class="chk"><input type="checkbox" id="o-split"${o.allowSplit ? ' checked' : ''}> Allow splitting a lab across years</label>
      <label class="chk"><input type="checkbox" id="o-over"${o.overflow ? ' checked' : ''}> Let overflow use other funding sources</label></div>
      <details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">Urgency weights</summary><div class="toolbar" style="margin-top:8px">${[['age', 'Age'], ['over', 'Overdue'], ['war', 'Warranty expired'], ['rep', 'Repairs'], ['use', 'Heavy usage'], ['os', 'OS unsupported']].map(([k, l]) => `<div class="field" style="min-width:90px"><label>${l}</label><input type="number" step="0.1" min="0" data-w="${k}" value="${o.w[k]}"></div>`).join('')}</div></details></div>
    <div class="kpis">${tile('', 'dollar', '', money(sum(items.filter(i => i.fy !== 'Unfunded'), i => i.cost)), 'Scheduled spend', `${fmtNum(sum(items.filter(i => i.fy !== 'Unfunded'), i => i.qty))} devices`)}${tile('', 'alert', unf.length ? 'bad' : 'good', money(sum(unf, i => i.cost)), 'Unfunded', `${fmtNum(sum(unf, i => i.qty))} devices`)}${tile('', 'calendar', deferred.length ? 'warnk' : 'good', fmtNum(deferred.length), 'Pushed past due year', deferred.length ? `avg ${(sum(deferred, i => i.fy - i.nat) / deferred.length).toFixed(1)} yrs` : '')}</div>
    <div class="card"><div class="card-h"><h3>Scheduled spend by fiscal year</h3></div><div id="pl-chart"></div></div>
    <div class="card"><div class="card-h"><h3>Budget vs. schedule</h3></div><table><thead><tr><th>Fiscal year</th><th class="num">Budget</th><th class="num">Scheduled</th><th class="num">Left over</th>${srcs.map(s => `<th class="num">${esc(s)}</th>`).join('')}</tr></thead><tbody>${cols.map(f => `<tr><td><b>${f === 'Unfunded' ? 'Unfunded' : 'FY' + f}</b></td><td class="num">${f === 'Unfunded' ? '' : hasBudget ? money(budgetOf(f)) : '—'}</td><td class="num">${money(by(f))}</td><td class="num">${f === 'Unfunded' || !hasBudget ? '' : `<span class="badge ${budgetOf(f) - by(f) < 0 ? 'bad' : 'ok'}">${money(budgetOf(f) - by(f))}</span>`}</td>${srcs.map(s => `<td class="num">${by(f, s) ? money(by(f, s)) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="card"><div class="card-h"><h3>What if the lifecycle were different?</h3></div><p class="small muted">Spend per fiscal year if every device were replaced at exactly this age (ignores per-model overrides and budgets). Overdue items fall in the current year.</p>
      <table><thead><tr><th>Lifecycle</th>${fys.map(f => `<th class="num">FY${f}</th>`).join('')}<th class="num">Beyond</th></tr></thead><tbody>${[3, 4, 5, 6].map(y => { const sc = lifecycleScenario(y); return `<tr><td>${y} years</td>${fys.map(f => `<td class="num">${money(sc[f] || 0)}</td>`).join('')}<td class="num">${money(sum(Object.entries(sc).filter(([f]) => +f > fys[fys.length - 1]), ([, v]) => v))}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="card"><div class="card-h"><h3>Proposed schedule</h3></div><div id="pl-tbl"></div></div>`;
    renderChart($('#pl-chart'), { type: 'bar', labels: cols.map(f => f === 'Unfunded' ? 'Unfunded' : 'FY' + f), series: (srcs.length ? srcs : ['Replacement budget']).map(s => ({ name: s, values: cols.map(f => by(f, s)) })), money: true, title: 'Scheduled spend' });
    const why = i => Object.entries(i.parts).filter(([, v]) => Math.abs(v) > 0.05).map(([k, v]) => `${{ age: 'age', over: 'overdue', war: 'warranty', rep: 'repairs', use: 'usage', os: 'OS' }[k]} ${v.toFixed(1)}`).join(', ');
    mountTable($('#pl-tbl', el), {
      id: 'plan2', csvName: 'proposed-schedule', rows: () => items.map((i, n) => ({ ...i, k: String(n) })), rowId: r => r.k, defaultSort: { k: 'fy', dir: 'asc' }, pageSize: 50,
      filters: [{ k: 'fy', label: 'Year', options: () => cols.map(String), test: (r, v) => String(r.fy) === v }, { k: 's', label: 'Source', options: () => srcs, test: (r, v) => r.src === v }],
      cols: [
        { k: 'fy', label: 'Proposed', val: r => r.fy === 'Unfunded' ? 9999 : r.fy, html: r => r.fy === 'Unfunded' ? '<span class="badge bad">Unfunded</span>' : 'FY' + r.fy },
        { k: 'lab', label: 'Lab', val: r => labLabel(DB.get('labs', r.l.labId)), html: r => `<a href="#/lab/${r.l.labId}">${esc(labLabel(DB.get('labs', r.l.labId)))}</a>` }, { k: 'model', label: 'Model', val: r => modelName(r.l) },
        { k: 'qty', label: 'Qty', val: r => r.qty, html: r => r.qty + (r.partial ? ` <span class="muted small">of ${r.l.qty}</span>` : ''), num: true }, { k: 'cost', label: 'Cost', val: r => r.cost, html: r => money(r.cost), num: true },
        { k: 'src', label: 'Funding', val: r => r.src, html: r => esc(r.src) + (r.moved ? ' <span class="badge warn">overflow</span>' : '') },
        { k: 'nat', label: 'Due', val: r => r.nat, html: r => 'FY' + r.nat },
        { k: 'delay', label: 'Slip', val: r => r.fy === 'Unfunded' ? 99 : r.fy - r.nat, html: r => r.fy === 'Unfunded' ? '' : r.fy > r.nat ? `<span class="badge warn">+${r.fy - r.nat} yr</span>` : r.fy < r.nat ? `<span class="badge info">${r.fy - r.nat} yr</span>` : '<span class="muted">on time</span>', num: true },
        { k: 'score', label: 'Urgency', val: r => +r.score.toFixed(2), html: r => `<span title="${esc(why(r))}">${r.score.toFixed(2)}</span><div class="small muted">${esc(why(r))}</div>`, num: true }]
    });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.b) { const [f, s] = t.dataset.b.split('|'), B = JSON.parse(JSON.stringify(S().budgets || {})); (B['FY' + f] ??= {})[s] = t.value === '' ? '' : +t.value; DB.setSetting('budgets', B); }
      else if (t.dataset.w) o.w[t.dataset.w] = +t.value || 0; else if (t.id === 'o-years') o.years = +t.value; else if (t.id === 'o-pull') o.pull = +t.value;
      else if (t.id === 'o-split') o.allowSplit = t.checked; else if (t.id === 'o-over') o.overflow = t.checked; else return;
      render();
    });
    $('#pl-csv', el).onclick = () => download('budget-plan.csv', toCSV([['Proposed year', 'Lab', 'Model', 'Qty', 'Cost', 'Funding', 'Due year', 'Urgency', 'Why'], ...items.map(i => [i.fy === 'Unfunded' ? 'Unfunded' : 'FY' + i.fy, labLabel(DB.get('labs', i.l.labId)), modelName(i.l), i.qty, i.cost, i.src, 'FY' + i.nat, i.score.toFixed(2), why(i)])]));
    $('#pl-apply', el).onclick = () => {
      const moves = items.filter(i => i.fy !== 'Unfunded' && !i.partial && (i.fy !== i.nat || i.moved));
      if (!moves.length) return toast('Nothing to change – every line is already scheduled in its natural year.');
      if (!confirm(`Set planned replacement dates (and funding for overflow) on ${moves.length} hardware line(s)? Partial (split) lines are skipped.`)) return;
      moves.forEach(i => { const d = addMonths(fyRange(i.fy)[0], o.month - 1); DB.put('hardware', { ...i.l, plannedOverride: d, plannedFunding: i.src }); });
      DB.log(`Applied budget planner schedule to ${moves.length} hardware lines`); toast(`Updated ${moves.length} line(s) – see the Replacement plan`); render();
    };
    $('#pl-prop', el).onclick = () => proposalFromPlanner(R);
    $('#pl-proj', el).onclick = () => projectsFromPlanner(R);
  }
};
