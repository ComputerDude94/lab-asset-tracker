// Reports: saved lifecycle scenarios vs budget, and funding rollover (carry-forward of unspent money across fiscal years).
REPORT_EXT.finance = host => {
  const t = todayStr(), fy0 = fiscalYear(t), B = S().budgets || {}, fys = Array.from({ length: 6 }, (_, i) => fy0 + i), sc = S().scenarios || [];
  const budgetFY = f => sum(Object.values(B['FY' + f] || {}), v => +v || 0);
  const natural = (() => { const o = {}; DB.data.hardware.filter(isActiveLine).forEach(l => { const p = plannedDate(l); if (!p) return; const f = Math.max(fy0, fiscalYear(p)); o[f] = (o[f] || 0) + lineCost(l); }); return o; })();
  const rows = [{ id: '', name: 'Current rules (per-model lifecycles)', data: natural }, ...sc.map(s => ({ id: s.id, name: `${s.name} – every ${s.years} yr`, data: lifecycleScenario(+s.years) }))];
  // rollover per funding source, ascending fiscal years
  const srcs = [...new Set([...(S().fundingSources || []), ...Object.values(B).flatMap(o => Object.keys(o || {}))])], carry = S().rollover !== false;
  const yrs = [...new Set([fy0 - 1, ...Object.keys(B).map(k => +k.replace('FY', '')), ...DB.data.projects.map(p => +p.fy), ...DB.data.techProjects.map(p => +p.fy)].filter(Boolean))].sort(), R = [];
  srcs.forEach(src => {
    let cin = 0;
    yrs.forEach(f => {
      const bud = +(B['FY' + f] || {})[src] || 0;
      const rp = DB.data.projects.filter(p => +p.fy === f && (p.fundingSource || 'Replacement budget') === src && p.status !== 'On hold');
      const tp = src === 'Tech fee project' ? DB.data.techProjects.filter(p => +p.fy === f && !['Denied', 'Idea'].includes(p.status)) : [];
      const committed = sum(rp, p => +p.amount || 0) + sum(tp, p => +p.awarded || 0), spent = sum(rp.filter(p => p.status === 'Complete'), p => +p.amount || 0) + sum(tp, p => +p.spent || 0);
      if (!bud && !committed && !cin) return;
      R.push({ src, f, cin, bud, committed, spent, cout: cin + bud - Math.max(committed, spent) }); cin = carry ? R[R.length - 1].cout : 0;
    });
  });
  host.innerHTML = `<div class="card"><div class="card-h"><h3>Lifecycle scenarios vs. budget</h3></div><p class="small muted">Spend per fiscal year if devices were replaced at a different age (overdue items fall in the current year). Compared with the total budget you entered in the Budget planner.</p>
    <table><thead><tr><th>Scenario</th>${fys.map(f => `<th class="num">FY${f}</th>`).join('')}<th></th></tr></thead><tbody>
    <tr><td><b>Budget entered</b></td>${fys.map(f => `<td class="num">${budgetFY(f) ? money(budgetFY(f)) : '—'}</td>`).join('')}<td></td></tr>
    ${rows.map(r => `<tr><td>${esc(r.name)}</td>${fys.map(f => { const v = r.data[f] || 0, b = budgetFY(f); return `<td class="num${b && v > b ? ' bad' : ''}" ${b && v > b ? 'style="color:var(--bad,#c0392b)"' : ''}>${money(v)}</td>`; }).join('')}<td>${r.id ? `<button class="btn sm edit-only" data-delsc="${r.id}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table>
    <div class="toolbar edit-only" style="margin-top:10px"><div class="field"><label>Save a scenario</label><input id="sc-n" placeholder="e.g. Stretch to 5 years"></div><div class="field"><label>Years</label><input id="sc-y" type="number" min="1" max="12" value="5" style="width:70px"></div><button class="btn" id="sc-add">Save</button></div></div>
    <div class="card"><div class="card-h"><h3>Funding rollover</h3><span class="spacer"></span><label class="check edit-only small"><input type="checkbox" id="ro-on"${carry ? ' checked' : ''}> Carry unspent money into the next year</label></div>
    <p class="small muted">Budget (from the Budget planner) plus what carried in, minus the larger of committed and spent. Replacement projects count their amount; Tech Fee projects count awarded and spent.</p>
    ${R.length ? `<table><thead><tr><th>Source</th><th>FY</th><th class="num">Carried in</th><th class="num">Budget</th><th class="num">Committed</th><th class="num">Spent</th><th class="num">Carried out</th></tr></thead><tbody>${R.map(r => `<tr><td>${esc(r.src)}</td><td>FY${r.f}</td><td class="num">${money(r.cin)}</td><td class="num">${money(r.bud)}</td><td class="num">${money(r.committed)}</td><td class="num">${money(r.spent)}</td><td class="num"${r.cout < 0 ? ' style="color:var(--bad,#c0392b)"' : ''}><b>${money(r.cout)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Enter budgets in the Budget planner, or add project amounts, to see rollover.</div>'}</div>`;
  $('#sc-add', host).onclick = () => { const n = $('#sc-n', host).value.trim(), y = +$('#sc-y', host).value; if (!n || !y) return toast('Name and years needed', 'err'); DB.setSetting('scenarios', [...sc, { id: uid(), name: n, years: y }]); render(); };
  $('#ro-on', host).onchange = e => { DB.setSetting('rollover', e.target.checked); render(); };
  host.onclick = e => { const d = e.target.closest('[data-delsc]'); if (d) { DB.setSetting('scenarios', sc.filter(s => s.id !== d.dataset.delsc)); render(); } };
};
