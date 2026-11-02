// Executive summary: one screen (and one printed page) for people who need the answer, not the data.
function execFigures() {
  const d = DB.data, t = todayStr(), fy0 = fiscalYear(t), lines = d.hardware.filter(isActiveLine), B = S().budgets || {};
  const qty = l => +l.qty || 0, totalQty = sum(lines, qty), over = lines.filter(l => lineState(l) === 'Overdue'), overQty = sum(over, qty);
  const devs = d.devices.filter(x => devStatus(x) !== 'Archived'), osBad = devs.filter(x => osState(x) === 'Unsupported').length, openM = d.maintenances.filter(m => !m.endDate).length;
  const dated = lines.filter(l => plannedDate(l)), aged = lines.filter(l => ageBase(l));
  const avgAge = aged.length ? sum(aged, l => yearsBetween(ageBase(l), t) * qty(l)) / Math.max(1, sum(aged, qty)) : 0;
  const factors = [
    { n: 'Replacement currency', w: 40, v: totalQty ? 1 - overQty / totalQty : 1, why: `${fmtNum(overQty)} of ${fmtNum(totalQty)} devices are past their planned date` },
    { n: 'Operating system support', w: 25, v: devs.length ? 1 - osBad / devs.length : 1, why: `${fmtNum(osBad)} of ${fmtNum(devs.length)} managed devices run an unsupported OS` },
    { n: 'Planning data complete', w: 20, v: lines.length ? dated.length / lines.length : 1, why: `${dated.length} of ${lines.length} hardware lines have a date to schedule from` },
    { n: 'Maintenance backlog', w: 15, v: devs.length ? Math.max(0, 1 - openM / Math.max(1, devs.length * 0.05)) : 1, why: `${openM} open job(s); full marks at under 5% of devices` }
  ];
  const score = Math.round(sum(factors, f => f.w * f.v));
  const fys = Array.from({ length: 5 }, (_, i) => fy0 + i), spendFY = f => sum(lines.filter(l => { const p = plannedDate(l); return p && (fiscalYear(p) === f || (f === fy0 && p < t)); }), lineCost);
  const budgetFY = f => sum(Object.values(B['FY' + f] || {}), v => +v || 0), hasBudget = fys.some(f => budgetFY(f) > 0);
  const next12 = sum(lines.filter(l => { const p = plannedDate(l); return p && p <= addMonths(t, 12); }), lineCost);
  return { d, t, fy0, lines, totalQty, over, overQty, devs, osBad, openM, avgAge, factors, score, fys, spendFY, budgetFY, hasBudget, next12 };
}
const scoreBand = s => s >= 85 ? ['Strong', 'ok'] : s >= 70 ? ['Good', 'ok'] : s >= 50 ? ['Watch', 'warn'] : ['At risk', 'bad'];
function ringSVG(score, band) {
  const r = 54, c = 2 * Math.PI * r;
  return `<svg class="ring ${band}" viewBox="0 0 140 140" role="img" aria-label="Fleet health ${score} out of 100"><circle cx="70" cy="70" r="${r}" class="ring-bg"/><circle cx="70" cy="70" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" style="--full:${c.toFixed(1)};--off:${(c * (1 - score / 100)).toFixed(1)}" transform="rotate(-90 70 70)"/><text x="70" y="68" text-anchor="middle" class="ring-n">${score}</text><text x="70" y="88" text-anchor="middle" class="ring-s">out of 100</text></svg>`;
}
const meterRow = (label, pctv, tone, right) => `<div class="mrow"><div class="mrow-h"><span>${label}</span><span class="muted small">${right}</span></div><div class="meter ${tone}"><i style="width:${Math.round(Math.max(0, Math.min(1, pctv)) * 100)}%"></i></div></div>`;

VIEWS.exec = {
  render(el) {
    const F = execFigures(), { d, t, fy0, lines, totalQty, over, overQty, avgAge, factors, score, fys, spendFY, budgetFY, hasBudget, next12 } = F, [band, tone] = scoreBand(score);
    if (!lines.length) { el.innerHTML = pageHead('Executive summary', '', 'Executive summary') + '<div class="card empty">No hardware lines yet, so there is nothing to summarize. Import your inventory (Import → Legacy list or the Lab list), then come back.</div>'; return; }
    const overCost = sum(over, lineCost), budNow = budgetFY(fy0), spNow = spendFY(fy0);
    const bySpend = fys.map(spendFY);
    const sentence = `<b>${fmtNum(overQty)} of ${fmtNum(totalQty)} devices (${totalQty ? Math.round(overQty / totalQty * 100) : 0}%)</b> are past their planned replacement date, a ${money(overCost)} backlog. The next 12 months of planned replacements total <b>${money(next12)}</b>${hasBudget && budNow ? `; FY${fy0} has <b>${money(budNow)}</b> budgeted against <b>${money(spNow)}</b> scheduled (${budNow - spNow >= 0 ? money(budNow - spNow) + ' left over' : '<span style="color:var(--danger)">' + money(spNow - budNow) + ' short</span>'})` : ' (no budget entered yet, so there is nothing to compare against)'}. Average device age is <b>${avgAge.toFixed(1)} years</b>.`;
    // buildings
    const bRows = [...group(lines, l => labBuilding(l.labId))].map(([b, ls]) => { const q = sum(ls, l => +l.qty || 0), oq = sum(ls.filter(l => lineState(l) === 'Overdue'), l => +l.qty || 0); return { b, q, oq, cost: sum(ls.filter(l => lineState(l) === 'Overdue'), lineCost) }; }).filter(r => r.oq).sort((a, b) => b.oq - a.oq).slice(0, 8);
    const maxO = Math.max(1, ...bRows.map(r => r.oq));
    // replace-first labs
    const labRows = [...group(over, l => l.labId)].map(([id, ls]) => ({ lab: DB.get('labs', id), qty: sum(ls, l => +l.qty || 0), cost: sum(ls, lineCost), oldest: ls.map(l => plannedDate(l)).filter(Boolean).sort()[0] })).filter(r => r.lab).sort((a, b) => b.cost - a.cost).slice(0, 5);
    // pipeline
    const pj = d.projects, live = pj.filter(p => !['Complete', 'On hold'].includes(p.status || 'Planned'));
    const funnel = PROJECT_STATUS.slice(0, 7).map(s => { const ps = pj.filter(p => (p.status || 'Planned') === s); return { s, n: ps.length, v: sum(ps, p => +p.amount || 0) }; });
    const maxN = Math.max(1, ...funnel.map(f => f.n));
    const tf = d.techProjects.filter(p => !['Denied', 'On hold'].includes(p.status));
    const tfReq = sum(tf, p => +p.requested || 0), tfAw = sum(tf, p => +p.awarded || 0), tfSp = sum(tf, p => +p.spent || 0);
    const bcfg = { type: 'bar', labels: fys.map(f => 'FY' + f), series: [...(hasBudget ? [{ name: 'Budget', values: fys.map(budgetFY) }] : []), { name: 'Scheduled', values: bySpend }], money: true, stacked: false, title: 'Budget vs scheduled spend' };
    const kt = (icon, cls, v, l, s, spark) => `<div class="kpi ${cls}"><span class="ico">${ic(icon)}</span><span style="flex:1;min-width:0"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}${spark ? `<div style="margin-top:6px">${spark}</div>` : ''}</span></div>`;
    const secs = [
      { id: 'health', title: 'Fleet health', html: `<div class="card hero"><div class="hero-ring">${ringSVG(score, tone)}<span class="badge ${tone}">${band}</span></div><div class="hero-body"><p class="hero-sum">${sentence}</p><div class="hero-f">${factors.map(f => meterRow(`${esc(f.n)} <span class="muted small">(${f.w} pts)</span>`, f.v, f.v >= .85 ? 'ok' : f.v >= .6 ? 'warn' : 'bad', `${Math.round(f.v * f.w)} / ${f.w}`) + `<div class="small muted" style="margin:-2px 0 8px">${esc(f.why)}</div>`).join('')}</div></div></div>`, note: 'Score is a simple weighted blend; the weights are shown so it can be challenged' },
      { id: 'kpis', title: 'Headline numbers', html: `<div class="kpis">
        ${kt('laptop', 'infok', `<span class="big-n">${fmtNum(totalQty)}</span>`, 'Devices in inventory', `${d.labs.length} labs · ${d.buildings.length} buildings`)}
        ${kt('alert', over.length ? 'bad' : 'good', `${totalQty ? Math.round(overQty / totalQty * 100) : 0}%`, 'Past replacement date', `${money(overCost)} to clear`)}
        ${kt('clock', '', avgAge.toFixed(1) + ' yrs', 'Average device age', `Policy: Win ${S().lifecycle.Windows} / Mac ${S().lifecycle.Mac} yrs`, sparkSVG(AGE_ORDER.slice(0, 6).map(a => sum(lines.filter(l => ageBucket(l) === a), l => +l.qty || 0))))}
        ${kt('calendar', 'warnk', money(next12), 'Next 12 months', 'planned replacements', sparkSVG(bySpend))}
        ${kt('dollar', '', hasBudget && budNow ? Math.round(spNow / budNow * 100) + '%' : '—', `FY${fy0} budget used`, hasBudget && budNow ? `${money(spNow)} of ${money(budNow)}` : 'enter budgets in the planner')}
        ${kt('tool', live.length ? 'warnk' : '', `<span class="big-n">${live.length}</span>`, 'Active projects', `${money(sum(live, p => +p.amount || 0))} in flight`)}
      </div>` },
      { id: 'budget', title: 'Budget vs. scheduled spend', html: `<div class="grid g2"><div class="card"><div class="card-h"><h3>Next five fiscal years</h3><span class="spacer"></span><a href="#/planner">Open budget planner →</a></div><div id="ex-bud"></div></div>${chartCard('Planned replacement spend by fiscal year', presetCfg('Planned replacement spend by fiscal year').cfg)}</div>` },
      { id: 'risk', title: 'Where the risk sits', html: `<div class="grid g2">
        <div class="card"><div class="card-h"><h3>Overdue devices by building</h3></div>${bRows.length ? bRows.map(r => meterRow(esc(r.b), r.oq / maxO, r.oq / Math.max(1, r.q) > .5 ? 'bad' : 'warn', `${fmtNum(r.oq)} of ${fmtNum(r.q)} · ${money(r.cost)}`)).join('') : '<div class="empty">Nothing is overdue.</div>'}</div>
        <div class="card"><div class="card-h"><h3>Replace these labs first</h3><span class="spacer"></span><a href="#/plan">Full plan →</a></div>${labRows.length ? `<table><thead><tr><th>Lab</th><th class="num">Devices</th><th>Overdue since</th><th class="num">Cost</th></tr></thead><tbody>${labRows.map(r => `<tr><td><a href="#/lab/${r.lab.id}">${esc(labLabel(r.lab))}</a></td><td class="num">${fmtNum(r.qty)}</td><td class="nowrap">${r.oldest ? fmtDate(r.oldest) : ''}</td><td class="num">${money(r.cost)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nothing is overdue.</div>'}</div></div>` },
      { id: 'pipeline', title: 'Projects and Tech Fee funding', html: `<div class="grid g2">
        <div class="card"><div class="card-h"><h3>Replacement project pipeline</h3><span class="spacer"></span><a href="#/projects">Board →</a></div>${pj.length ? funnel.map(f => meterRow(esc(f.s), f.n / maxN, 'acc', `${f.n}${f.v ? ' · ' + money(f.v) : ''}`)).join('') : '<div class="empty">No projects yet. They are created automatically from the replacement plan.</div>'}</div>
        <div class="card"><div class="card-h"><h3>Tech Fee projects</h3><span class="spacer"></span><a href="#/techfee">Open →</a></div>${tf.length ? `<div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:0 0 12px"><div class="kpi"><div class="v">${money(tfReq)}</div><div class="l">Requested</div></div><div class="kpi"><div class="v">${money(tfAw)}</div><div class="l">Awarded</div></div><div class="kpi"><div class="v">${money(tfSp)}</div><div class="l">Spent</div></div></div>${meterRow('Awarded vs requested', tfReq ? tfAw / tfReq : 0, 'ok', tfReq ? Math.round(tfAw / tfReq * 100) + '%' : '')}${meterRow('Spent vs awarded', tfAw ? tfSp / tfAw : 0, 'acc', tfAw ? Math.round(tfSp / tfAw * 100) + '%' : '')}` : '<div class="empty">No Tech Fee projects yet.</div>'}</div></div>` },
      { id: 'mix', title: 'Fleet profile', html: `<div class="grid g2">${chartCard('Hardware age', presetCfg('Hardware age').cfg)}${chartCard('Devices by platform', presetCfg('Devices by platform').cfg)}</div>` }
    ];
    el.innerHTML = pageHead('Executive summary', `<span class="muted small" style="align-self:center">As of ${fmtDate(t)}</span><button class="btn" onclick="window.print()">${ic('file')} Print / save as PDF</button>`, 'Executive summary') + dashLayout('exec', secs);
    const eb = $('#ex-bud', el); if (eb) renderChart(eb, bcfg);
  }
};
