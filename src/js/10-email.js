// Replacement-notice emails: build a message listing the lab's devices and software for the recipient to confirm.
const emailTpl = () => Object.assign({}, DEFAULT_SETTINGS.emailTemplate, S().emailTemplate || {});
const fill = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const nl2br = t => esc(t).replace(/\n/g, '<br>');

function noticeData(labs) {
  return labs.map(lab => {
    const lines = (linesByLab().get(lab.id) || []).filter(isActiveLine);
    const dates = lines.map(plannedDate).filter(Boolean).sort();
    return {
      lab, next: dates[0] || '', managed: (devicesByLab().get(lab.id) || []).length,
      lines: lines.map(l => ({ model: modelName(l), spec: modelSpec(getModel(l)), qty: l.qty, os: l.os || getModel(l)?.os || '', last: ageBase(l), planned: plannedDate(l), funding: l.fundingSource || '' })),
      sw: softwareForLab(lab.id).sort((a, b) => cmp(a.sw.name, b.sw.name)).map(({ ls, sw }) => ({ name: sw.name, version: ls.version || sw.version || '', platforms: (sw.platforms || []).join(' / '), vendor: sw.vendor || '' }))
    };
  });
}
const TH = 'style="border:1px solid #cfd6e0;background:#eef2f8;padding:5px 8px;text-align:left;font-size:12px"', TD = 'style="border:1px solid #cfd6e0;padding:5px 8px;font-size:13px;vertical-align:top"';
function noticeBody(labs, o) {
  const data = noticeData(labs), multi = data.length > 1;
  const vars = { name: o.greeting, lab: multi ? `${data.length} labs` : labLabel(data[0].lab), date: o.date, deadline: fmtDate(o.deadline), sender: DB.user };
  const intro = fill(o.intro, vars), outro = fill(o.outro, vars);
  let html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1d2736;line-height:1.45"><p>${nl2br(intro)}</p>`, text = intro + '\n';
  data.forEach(d => {
    const lab = d.lab, b = DB.get('buildings', lab.buildingId);
    html += `<h3 style="margin:18px 0 4px;font-size:15px">${esc(labLabel(lab))}</h3><div style="color:#5b6577;font-size:12px">${esc(b?.name || '')}${lab.department ? ' · ' + esc(lab.department) : ''} · ${lab.seats || '?'} seats · planned replacement ${d.next ? fmtDate(d.next) : 'TBD'}</div>`;
    text += `\n=== ${labLabel(lab)} (${b?.name || ''}) — planned replacement ${d.next ? fmtDate(d.next) : 'TBD'} ===\n`;
    html += `<p style="margin:10px 0 4px"><b>Devices</b> — please confirm quantity and details are correct:</p>`;
    html += d.lines.length ? `<table style="border-collapse:collapse"><tr><th ${TH}>Model</th><th ${TH}>Specifications</th><th ${TH}>Qty</th><th ${TH}>Operating system</th><th ${TH}>In service since</th><th ${TH}>Corrections?</th></tr>${d.lines.map(l => `<tr><td ${TD}>${esc(l.model)}</td><td ${TD}>${esc(l.spec || '—')}</td><td ${TD}>${l.qty}</td><td ${TD}>${esc(l.os || '—')}</td><td ${TD}>${l.last ? fmtDate(l.last) : '—'}</td><td ${TD}>&nbsp;</td></tr>`).join('')}</table>` : '<p><i>No devices on record.</i></p>';
    text += 'Devices:\n' + (d.lines.map(l => `  - ${l.qty} x ${l.model}${l.spec ? ' (' + l.spec + ')' : ''}${l.os ? ', ' + l.os : ''}`).join('\n') || '  (none on record)') + '\n';
    html += `<p style="margin:14px 0 4px"><b>Applications</b> — please confirm each title and the version needed on the new devices:</p>`;
    html += d.sw.length ? `<table style="border-collapse:collapse"><tr><th ${TH}>Application</th><th ${TH}>Vendor</th><th ${TH}>Platform</th><th ${TH}>Version on record</th><th ${TH}>Version needed / changes</th></tr>${d.sw.map(s => `<tr><td ${TD}>${esc(s.name)}</td><td ${TD}>${esc(s.vendor || '—')}</td><td ${TD}>${esc(s.platforms || '—')}</td><td ${TD}>${esc(s.version || 'not recorded')}</td><td ${TD}>&nbsp;</td></tr>`).join('')}</table>` : '<p><i>No applications on record — please list everything that should be installed.</i></p>';
    text += 'Applications (version on record):\n' + (d.sw.map(s => `  - ${s.name}${s.vendor ? ' (' + s.vendor + ')' : ''}: ${s.version || 'version not recorded'}`).join('\n') || '  (none on record — please list everything needed)') + '\n';
  });
  html += `<p>Please also let us know about anything not listed above (additional applications, peripherals, accessibility needs, special configurations).</p><p>${nl2br(outro)}</p></div>`;
  text += '\nPlease also tell us about anything not listed above (additional applications, peripherals, accessibility needs, special configurations).\n\n' + outro;
  return { html, text, subject: fill(o.subject, vars) };
}

function composeNotice(labs, contacts) {
  labs = labs.filter(Boolean);
  const tpl = emailTpl(), withMail = contacts.filter(c => c.email), data = noticeData(labs);
  const firstDate = data.map(d => d.next).filter(Boolean).sort()[0] || '';
  const body = document.createElement('div');
  body.innerHTML = `<div class="form-grid">
    <div class="field wide"><label>To</label>${contacts.length ? `<div class="multi" data-multi="to" style="grid-template-columns:1fr">${contacts.map(c => `<label class="chk"><input type="checkbox" value="${esc(c.email || '')}"${c.email ? ' checked' : ' disabled'}> ${esc(c.name)} <span class="muted small">${esc(c.email || 'no email on file')}</span></label>`).join('')}</div>` : '<div class="help">No contacts are linked to this lab yet — you can still copy the message and paste your own recipients.</div>'}</div>
    <div class="field"><label>Reply by</label><input type="date" id="n-deadline" value="${addMonths(todayStr(), 0) && ymd(new Date(Date.now() + 14 * 864e5))}"></div>
    <div class="field"><label>Replacement date to mention</label><input type="date" id="n-date" value="${firstDate}"></div>
    <div class="field wide"><label>Subject</label><input id="n-subject" value="${esc(tpl.subject)}"></div>
    <div class="field wide"><label>Opening</label><textarea id="n-intro" rows="7">${esc(tpl.intro)}</textarea></div>
    <div class="field wide"><label>Closing</label><textarea id="n-outro" rows="2">${esc(tpl.outro)}</textarea><div class="help">Placeholders: {name} {lab} {date} {deadline} {sender}. Edit the defaults in Settings.</div></div></div>
    <h3 style="margin-top:14px">Preview</h3><div id="n-prev" style="border:1px solid var(--border);border-radius:8px;padding:12px;background:#fff;color:#1d2736;max-height:340px;overflow:auto"></div>`;
  const state = () => {
    const to = $$('[data-multi="to"] input:checked', body).map(i => i.value).filter(Boolean);
    const names = contacts.filter(c => to.includes(c.email)).map(c => c.name.split(' ')[0]);
    const o = { greeting: names.length === 1 ? names[0] : 'team', deadline: $('#n-deadline', body).value, date: $('#n-date', body).value ? fmtDate($('#n-date', body).value) : 'TBD', subject: $('#n-subject', body).value, intro: $('#n-intro', body).value, outro: $('#n-outro', body).value };
    return { to, ...noticeBody(labs, o) };
  };
  const draw = () => { $('#n-prev', body).innerHTML = `<div style="font-weight:600;margin-bottom:8px">Subject: ${esc(state().subject)}</div>` + state().html; };
  body.addEventListener('input', draw); body.addEventListener('change', draw); draw();
  const log = how => {
    labs.forEach(lab => DB.put('labs', { ...lab, notified: [...(lab.notified || []), { date: todayStr(), by: DB.user, to: state().to.join('; ') }].slice(-10) }));
    recordConfirmations(labs, state().to);
    DB.log(`Prepared replacement notice (${how}) for ${labs.map(labLabel).join(', ')}`);
  };
  const copyHTML = async () => {
    const s = state();
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([s.html], { type: 'text/html' }), 'text/plain': new Blob([s.text], { type: 'text/plain' }) })]); return true; }
    catch { const r = document.createRange(); r.selectNodeContents($('#n-prev', body)); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); const ok = document.execCommand('copy'); sel.removeAllRanges(); return ok; }
  };
  modal({
    title: `Email contacts — ${labs.length === 1 ? labLabel(labs[0]) : labs.length + ' labs'}`, body, wide: true, buttons: [
      { label: 'Close' },
      { label: 'Download .eml draft', onClick: () => { const s = state(); download(`replacement-notice-${labs[0] ? normKey(labLabel(labs[0])) : 'labs'}.eml`, buildEml(s), 'message/rfc822'); log('eml'); toast('Opens as an unsent draft in Outlook'); return false; } },
      { label: 'Copy formatted email', onClick: async () => { if (await copyHTML()) { log('copy'); toast('Copied — paste into a new email'); } else toast('Copy failed — select the preview and copy it by hand', 'err'); return false; } },
      { label: 'Open in email app', cls: 'primary', onClick: () => { const s = state(); let tx = s.text; const max = 1500; if (tx.length > max) tx = tx.slice(0, max) + '\n\n[Message shortened — use “Copy formatted email” for the full tables.]'; location.href = `mailto:${s.to.join(',')}?subject=${encodeURIComponent(s.subject)}&body=${encodeURIComponent(tx)}`; log('mailto'); return false; } }]
  });
}
function buildEml(s) {
  const b64 = str => btoa(unescape(encodeURIComponent(str))).replace(/.{1,76}/g, '$&\r\n');
  return ['X-Unsent: 1', `To: ${s.to.join(', ')}`, `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(s.subject)))}?=`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(s.html)].join('\r\n');
}
// From the plan: one row per contact with the labs they are responsible for.
function notifyPlanDialog(plan) {
  const byContact = new Map();
  plan.labs.forEach(g => contactsForLab(g.lab).forEach(({ c }) => { const e = byContact.get(c.id) || { c, labs: [] }; e.labs.push(g.lab); byContact.set(c.id, e); }));
  const rows = [...byContact.values()].sort((a, b) => cmp(a.c.name, b.c.name));
  const body = document.createElement('div');
  body.innerHTML = rows.length ? `<p class="muted small">One email per person covering every lab they’re linked to in this plan. Contacts are linked to labs directly, through the software installed there, or by platform.</p>
    <table><thead><tr><th>Contact</th><th>Labs in this plan</th><th></th></tr></thead><tbody>${rows.map((r, i) => `<tr><td><b>${esc(r.c.name)}</b><div class="small muted">${esc(r.c.role || '')}${r.c.email ? ' · ' + esc(r.c.email) : ' · no email'}</div></td><td class="small">${r.labs.map(l => `<span class="pill">${esc(labLabel(l))}</span>`).join('')}</td><td><button class="btn sm" data-i="${i}">Compose</button></td></tr>`).join('')}</tbody></table>
    <p><button class="btn sm" id="copy-all">Copy all email addresses</button></p>` : '<div class="empty">No contacts are linked to the labs in this plan. Add contacts on the Contacts page and link them to labs or software.</div>';
  body.onclick = e => {
    const b = e.target.closest('[data-i]'); if (b) { const r = rows[+b.dataset.i]; composeNotice(r.labs, [r.c]); }
    if (e.target.closest('#copy-all')) { navigator.clipboard?.writeText(rows.map(r => r.c.email).filter(Boolean).join('; ')).then(() => toast('Addresses copied')).catch(() => toast('Copy failed', 'err')); }
  };
  modal({ title: 'Notify contacts', body, wide: true, buttons: [{ label: 'Close', cls: 'primary' }] });
}
