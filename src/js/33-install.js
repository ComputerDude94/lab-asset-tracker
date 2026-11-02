// Install windows: place an install window after delivery, outside the blackout dates, and a printable lab sheet.
const addDays = (s, n) => { const x = parseD(s); x.setDate(x.getDate() + n); return ymd(x); };
function suggestWindow(from, days) {
  const bl = S().blackouts || []; let s = from;
  for (let i = 0; i < 30; i++) {
    const e = addDays(s, days - 1), hit = bl.find(b => s <= b.end && e >= b.start);
    if (!hit) return [s, e]; s = nextDay(hit.end);
  }
  return [s, addDays(s, days - 1)];
}
function suggestInstallWindows() {
  const t = todayStr(), days = +S().installDays || 10; let n = 0;
  DB.data.projects.slice().forEach(p => {
    if (p.installStart || !p.deliveryDate || ['Complete', 'On hold'].includes(p.status || 'Planned')) return;
    const from = nextDay(p.deliveryDate < t ? t : p.deliveryDate), [s, e] = suggestWindow(from, days);
    DB.put('projects', { ...p, installStart: s, installEnd: e, installSuggested: true }); n++;
  });
  if (n) DB.log(`Suggested install windows for ${n} project${n > 1 ? 's' : ''} (after delivery, outside blackout dates)`);
}
VIEWS.labsheet = {
  render(el) {
    const lab = DB.get('labs', route().param); if (!lab) { el.innerHTML = pageHead('Lab sheet') + '<div class="empty">Lab not found.</div>'; return; }
    const hw = DB.data.hardware.filter(l => l.labId === lab.id && isActiveLine(l)), sw = softwareForLab(lab.id), devs = DB.data.devices.filter(d => d.labId === lab.id && devStatus(d) !== 'Archived'), cts = contactsForLab(lab);
    const b = DB.get('buildings', lab.buildingId);
    el.innerHTML = pageHead(`Lab sheet – ${labLabel(lab)}`, `<button class="btn primary" id="pr">Print</button>`, `<a href="#/labs">Labs</a> › <a href="#/lab/${lab.id}">${esc(labLabel(lab))}</a> › Sheet`) + `<div class="card">
      <h2 style="margin:0">${esc(labLabel(lab))}</h2><p class="muted">${esc(b?.name || '')} · Room ${esc(lab.room || '')} · ${esc(lab.type || '')}${lab.department ? ' · ' + esc(lab.department) : ''}${lab.seats ? ' · ' + lab.seats + ' seats' : ''}</p>
      <h3>Contacts</h3><p class="small">${cts.map(({ c, why }) => `${esc(c.name)}${c.role ? ' (' + esc(c.role) + ')' : ''}${c.email ? ' – ' + esc(c.email) : ''}`).join('<br>') || '—'}</p>
      <h3>Hardware</h3><table><thead><tr><th>Model</th><th class="num">Qty</th><th>Specs</th><th>OS</th><th>Last replaced</th><th>Planned</th><th>Funding</th></tr></thead><tbody>${hw.map(l => `<tr><td>${esc(modelName(l))}</td><td class="num">${l.qty || ''}</td><td>${esc(modelSpec(DB.get('models', l.modelId)) || '')}</td><td>${esc(l.os || '')}</td><td>${esc(fmtDate(l.lastReplaced || l.purchaseDate))}</td><td>${esc(fmtDate(plannedDate(l)))}</td><td>${esc(l.fundingSource || '')}</td></tr>`).join('') || '<tr><td colspan="7">None</td></tr>'}</tbody></table>
      <h3>Applications</h3><p class="small">${sw.map(x => esc(x.sw.name) + (x.ls.version ? ' ' + esc(x.ls.version) : '')).join(' · ') || '—'}</p>
      <h3>Devices (${devs.length})</h3><table><thead><tr><th>Name</th><th>Serial</th><th>Asset tag</th><th>Model</th><th>Warranty ends</th><th>Verified ✓</th></tr></thead><tbody>${devs.map(d => `<tr><td>${esc(d.name || '')}</td><td>${esc(d.serial || '')}</td><td>${esc(d.assetTag || '')}</td><td>${esc(d.model || '')}</td><td>${esc(d.warrantyEnd ? fmtDate(d.warrantyEnd) : '')}</td><td>☐</td></tr>`).join('') || '<tr><td colspan="6">No individual devices recorded</td></tr>'}</tbody></table>
      ${lab.notes ? `<h3>Notes</h3><p class="small">${esc(lab.notes)}</p>` : ''}
      <p class="small muted" style="margin-top:24px">Printed ${esc(fmtDate(todayStr()))} by ${esc(DB.user)} · Checked by: ____________________ Date: ____________</p></div>`;
    $('#pr', el).onclick = () => window.print();
  }
};
