// "My labs": what a lab manager sees – their labs, devices and applications – with one-click confirmation.
function myContact() {
  const u = userByName(DB.user); if (!u) return null;
  return (u.contactId && DB.get('contacts', u.contactId)) || (u.email && DB.data.contacts.find(c => (c.email || '').toLowerCase() === u.email.toLowerCase())) || null;
}
VIEWS.mylabs = {
  render(el) {
    const ct = myContact(), isMgr = DB.role === 'Lab manager';
    let labs = ct ? DB.data.labs.filter(l => l.status !== 'Closed' && contactsForLab(l).some(x => x.c.id === ct.id)) : [];
    const showAll = !ct && !isMgr;
    if (showAll) labs = DB.data.labs.filter(l => l.status !== 'Closed');
    el.innerHTML = pageHead('My labs') + (ct ? `<p class="muted small">Labs linked to <b>${esc(ct.name)}</b>. Please check the devices and applications and press Confirm, or describe what needs changing.</p>` : showAll ? '<p class="muted small">Link your user to a contact (App users) to see only your own labs. Showing every lab.</p>' : '<div class="empty">Your user isn’t linked to a contact, so no labs can be shown. Ask an Admin to link it on the App users page.</div>');
    labs.forEach(lab => {
      const hw = DB.data.hardware.filter(l => l.labId === lab.id && isActiveLine(l)), sw = softwareForLab(lab.id), cf = ct && DB.data.confirmations.find(c => c.labId === lab.id && c.contactId === ct.id);
      const d = document.createElement('div'); d.className = 'card';
      d.innerHTML = `<div class="card-h"><h3><a href="#/lab/${lab.id}">${esc(labLabel(lab))}</a></h3><span class="spacer"></span>${cf ? `<span class="badge ${cf.status === 'Confirmed' ? 'ok' : 'warn'}">${esc(cf.status)}${cf.respondedDate ? ' ' + esc(fmtDate(cf.respondedDate)) : ''}</span>` : ''}</div>
        <table><thead><tr><th>Devices</th><th class="num">Qty</th><th>OS</th><th>Planned replacement</th></tr></thead><tbody>${hw.map(l => `<tr><td>${esc(modelName(l))}</td><td class="num">${l.qty || ''}</td><td>${esc(l.os || '')}</td><td>${esc(fmtDate(plannedDate(l)))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No devices recorded</td></tr>'}</tbody></table>
        <p class="small" style="margin:10px 0 4px"><b>Applications</b></p><div class="chips">${sw.map(x => `<span class="badge">${esc(x.sw.name)}${x.ls.version ? ' ' + esc(x.ls.version) : ''}</span>`).join('') || '<span class="muted small">None recorded</span>'}</div>
        ${ct ? `<div class="field" style="margin-top:12px"><label>Anything missing or wrong? (applications, versions, device counts)</label><textarea rows="2" data-note="${lab.id}">${esc(cf?.notes || '')}</textarea></div>
        <p><button class="btn primary" data-ok="${lab.id}">Everything is correct</button> <button class="btn" data-chg="${lab.id}">Send changes</button></p>` : ''}`;
      el.appendChild(d);
    });
    if (ct) el.onclick = e => {
      const ok = e.target.closest('[data-ok]'), ch = e.target.closest('[data-chg]'), id = (ok || ch)?.dataset.ok || ch?.dataset.chg; if (!id) return;
      const note = $(`[data-note="${id}"]`, el).value.trim(); if (ch && !note) return toast('Describe what needs to change first', 'err');
      const ex = DB.data.confirmations.find(c => c.labId === id && c.contactId === ct.id);
      DB.put('confirmations', { ...(ex || {}), labId: id, contactId: ct.id, status: ok ? 'Confirmed' : 'Changes requested', respondedDate: todayStr(), notes: note });
      DB.log(`${DB.user} ${ok ? 'confirmed' : 'requested changes for'} ${labLabel(DB.get('labs', id))}`); toast('Thank you – recorded'); render();
    };
  }
};
