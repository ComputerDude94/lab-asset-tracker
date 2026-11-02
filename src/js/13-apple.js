// Apple coverage. Apple's public coverage page (checkcoverage.apple.com) is one serial at a time and protected by a CAPTCHA, so it can't be
// automated. Two practical routes: (1) Apple School / Business Manager, which shows AppleCare coverage for devices bought through Apple or a
// reseller and accepts a pasted list of serials; (2) an assisted worklist here: copy serial -> open Apple -> type the date -> next.
const APPLE_COVERAGE_URL = 'https://checkcoverage.apple.com/?locale=en_US';
const isApple = d => d.platform === 'Mac' || /apple/i.test(d.manufacturer || '') || /^(imac|mac ?mini|mac ?studio|mac ?pro|macbook)/i.test(d.model || '');
const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } };

function appleCoverageDialog(ids, startOne) {
  const all = DB.data.devices.filter(d => d.serial && isApple(d));
  const sets = [['all', 'All Apple devices', all], ['missing', 'Only devices with no coverage date yet', all.filter(d => !d.warrantyEnd)], ['soon', 'Unknown or ending within 12 months', all.filter(d => !d.warrantyEnd || daysBetween(todayStr(), d.warrantyEnd) <= 365)]];
  if (ids) sets.unshift(['sel', 'Only the devices I selected', all.filter(d => ids.includes(d.id))]);
  let scope = sets[0][0], mode = startOne ? 'one' : 'bulk', i = 0;
  const body = document.createElement('div'), pool = () => [...new Map(sets.find(s => s[0] === scope)[2].map(d => [d.serial.trim().toUpperCase(), d])).values()];
  const draw = () => {
    const list = pool();
    let h = `<div class="tabs"><a data-m="bulk" class="${mode === 'bulk' ? 'on' : ''}">Bulk · Apple School/Business Manager</a><a data-m="one" class="${mode === 'one' ? 'on' : ''}">One by one · checkcoverage.apple.com</a></div>
      <div class="toolbar"><div class="field"><label>Which devices</label><select id="ap-scope">${sets.map(([k, l, a]) => `<option value="${k}"${k === scope ? ' selected' : ''}>${esc(l)} (${a.length})</option>`).join('')}</select></div></div>`;
    if (mode === 'bulk') {
      const chunks = Math.ceil(list.length / 1000);
      h += `<p class="small muted">Apple School Manager / Apple Business Manager show AppleCare coverage for devices purchased through Apple or an authorized reseller, and their device search accepts a pasted, comma-separated list of serial numbers. Copy the list, paste it there, and read off (or export, if your portal offers it) the coverage end dates. Devices not enrolled in your ASM/ABM won’t appear.</p>
        <div class="chips">${Array.from({ length: chunks }, (_, c) => `<button class="btn sm" data-copy="${c}">Copy serials ${c * 1000 + 1}–${Math.min(list.length, (c + 1) * 1000)}</button>`).join('') || '<span class="muted">No devices in this selection.</span>'}</div>
        <p class="small muted" style="margin-top:12px">If you can export a CSV with serial + coverage end date, bring it in with <b>Import → Warranty dates</b> (Apple-style column names are recognised). Otherwise use <i>One by one</i>.</p>`;
    } else {
      const d = list[i];
      h += !list.length ? '<div class="empty">No Apple devices with serial numbers in this selection.</div>' : !d ? `<div class="empty">All done — ${list.length} reviewed.</div>` : `
        <p class="small muted">Apple’s page asks for a CAPTCHA on every lookup, so this keeps the routine quick: the serial is copied for you; paste it into Apple’s page, solve the CAPTCHA, then type the “coverage expires” date here.</p>
        <div class="card" style="background:var(--surface2)"><div class="small muted">${i + 1} of ${list.length}</div><div style="font-size:24px;font-weight:700;letter-spacing:.03em">${esc(d.serial)}</div><div class="muted">${esc(d.name)} · ${esc(d.model || '')}</div>
        <div class="chips" style="margin:10px 0"><button class="btn primary" data-open>Copy serial &amp; open Apple ↗</button></div>
        <div class="form-grid"><div class="field"><label>Coverage ends</label><input type="date" id="ap-end" value="${esc(d.warrantyEnd || '')}"></div><div class="field"><label>Plan (optional)</label><input id="ap-plan" placeholder="e.g. AppleCare+, Limited Warranty" value="${esc(d.warrantyProduct || '')}"></div></div>
        ${d.purchaseDate ? `<div class="chips" style="margin-top:8px"><span class="small muted">Estimate from purchase (${fmtDate(d.purchaseDate)}):</span><button class="chip" data-est="1">+1 year (limited warranty)</button><button class="chip" data-est="3">+3 years (AppleCare+)</button></div>` : ''}
        <div class="chips" style="margin-top:12px"><button class="btn" data-skip>Skip</button><button class="btn primary" data-save>Save &amp; next</button></div></div>`;
    }
    body.innerHTML = h;
  };
  body.addEventListener('change', e => { if (e.target.id === 'ap-scope') { scope = e.target.value; i = 0; draw(); } });
  body.addEventListener('click', async e => {
    const t = e.target, list = pool();
    if (t.closest('[data-m]')) { mode = t.closest('[data-m]').dataset.m; i = 0; return draw(); }
    const c = t.closest('[data-copy]'); if (c) { const n = +c.dataset.copy; return toast((await copyText(list.slice(n * 1000, (n + 1) * 1000).map(d => d.serial.trim().toUpperCase()).join(','))) ? 'Serial list copied' : 'Copy failed', 'err'); }
    const d = list[i];
    if (t.closest('[data-open]') && d) { await copyText(d.serial); window.open(APPLE_COVERAGE_URL, '_blank', 'noopener'); toast('Serial copied — paste it on Apple’s page'); }
    else if (t.closest('[data-est]') && d) { $('#ap-end', body).value = addYears(d.purchaseDate, +t.closest('[data-est]').dataset.est); }
    else if (t.closest('[data-skip]')) { i++; draw(); }
    else if (t.closest('[data-save]') && d) {
      const end = $('#ap-end', body).value; if (!end) return toast('Enter the coverage end date first (or Skip).', 'err');
      saveWarranty(d, { end, start: '', product: $('#ap-plan', body).value.trim() }, 'Apple (manual)'); DB.log(`Recorded Apple coverage for ${d.serial}`); i++; draw();
    }
  });
  draw();
  modal({ title: 'Apple coverage', body, wide: true, buttons: [{ label: 'Close', cls: 'primary' }] });
}
const appleCardHTML = () => `<div class="card"><div class="card-h"><h3>Apple coverage</h3></div>
  <p class="small muted">Apple has no open lookup API and its public page uses a CAPTCHA, so coverage can’t be fetched automatically. Use Apple School/Business Manager for a bulk look-up, or the quick one-by-one worklist.</p>
  <div class="chips"><button class="btn primary sm" id="ap-open" type="button">Apple coverage tools…</button><a class="btn sm" target="_blank" rel="noopener" href="${APPLE_COVERAGE_URL}">Open Apple’s coverage page ↗</a></div></div>`;
const bindAppleCard = root => { $('#ap-open', root).onclick = () => appleCoverageDialog(); };
