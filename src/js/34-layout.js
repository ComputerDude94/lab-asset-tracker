// Shared interface helpers: rearrangeable + collapsible dashboard sections, kanban drag and drop, sparklines, count-up numbers.
// Layout choices are per-browser conveniences (localStorage); they never touch the shared data file.
const lsList = k => { try { const v = JSON.parse(lsGet(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
function dashLayout(key, sections) {
  const ord = lsList('lt-ord-' + key), shut = lsList('lt-shut-' + key), rank = s => { const i = ord.indexOf(s.id); return i < 0 ? 1e6 + sections.indexOf(s) : i; };
  return `<div class="dsecs" data-key="${key}"><div class="dsec-tools no-print"><span class="small muted">Drag <b>⋮⋮</b> to rearrange · click a heading to collapse</span><span class="spacer"></span><button class="btn sm" data-dsec-reset>Reset layout</button></div>` +
    [...sections].sort((a, b) => rank(a) - rank(b)).map(s => `<section class="dsec${shut.includes(s.id) ? ' shut' : ''}" data-sec="${s.id}"><div class="dsec-h"><span class="dsec-grip no-print" draggable="true" title="Drag to rearrange" aria-hidden="true">⋮⋮</span><button class="dsec-t" aria-expanded="${!shut.includes(s.id)}">${ic('down')}<span>${esc(s.title)}</span></button>${s.note ? `<span class="small muted dsec-n">${s.note}</span>` : ''}</div><div class="dsec-b"><div>${s.html}</div></div></section>`).join('') + '</div>';
}
function bindLayout(root) {
  const wrap = $('.dsecs', root); if (!wrap) return;
  const key = wrap.dataset.key; let drag = null;
  wrap.addEventListener('click', e => {
    if (e.target.closest('[data-dsec-reset]')) { lsSet('lt-ord-' + key, ''); lsSet('lt-shut-' + key, ''); return render(); }
    const t = e.target.closest('.dsec-t'); if (!t) return;
    const sec = t.closest('.dsec'), id = sec.dataset.sec, s = sec.classList.toggle('shut');
    t.setAttribute('aria-expanded', !s);
    const cur = lsList('lt-shut-' + key).filter(x => x !== id); if (s) cur.push(id); lsSet('lt-shut-' + key, cur.length ? JSON.stringify(cur) : '');
  });
  wrap.addEventListener('dragstart', e => {
    const g = e.target.closest?.('.dsec-grip'); if (!g) return;
    drag = g.closest('.dsec'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.dataset.sec);
    e.dataTransfer.setDragImage(drag.querySelector('.dsec-h'), 12, 12); const d0 = drag; setTimeout(() => { if (drag === d0) d0.classList.add('dragging'); }, 0);
  });
  wrap.addEventListener('dragover', e => {
    if (!drag) return; e.preventDefault();
    const over = e.target.closest('.dsec'); if (!over || over === drag) return;
    const r = over.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
    wrap.insertBefore(drag, after ? over.nextSibling : over);
  });
  const end = () => {
    if (!drag) return; drag.classList.remove('dragging'); drag = null;
    lsSet('lt-ord-' + key, JSON.stringify([...wrap.querySelectorAll('.dsec')].map(x => x.dataset.sec)));
  };
  wrap.addEventListener('drop', e => { if (drag) e.preventDefault(); end(); });
  wrap.addEventListener('dragend', end);
}

// Board cards: drag a card onto another column to change its status.
function kanbanDnD(host, table, statuses, dflt) {
  if (!host || DB.readOnly || DB.confirmOnly) return;
  let dragId = null;
  host.ondragstart = e => { const c = e.target.closest?.('[data-card]'); if (!c) return; dragId = c.dataset.card; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); setTimeout(() => c.classList.add('dragging'), 0); };
  host.ondragend = () => { dragId = null; $$('.dragging, .kcol.over', host).forEach(x => x.classList.remove('dragging', 'over')); };
  host.ondragover = e => { const col = e.target.closest?.('.kcol'); if (!dragId || !col) return; e.preventDefault(); $$('.kcol.over', host).forEach(x => x !== col && x.classList.remove('over')); col.classList.add('over'); };
  host.ondragleave = e => { const col = e.target.closest?.('.kcol'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('over'); };
  host.ondrop = e => {
    const col = e.target.closest?.('.kcol'); if (!dragId || !col) return; e.preventDefault();
    const rec = DB.get(table, dragId), to = col.dataset.col;
    if (rec && statuses.includes(to) && (rec.status || dflt) !== to) { DB.put(table, { ...rec, status: to }); DB.log(`Moved ${recName(table, rec)} to ${to}`); toast(`Moved to ${to}`); }
    dragId = null; render();
  };
}

// Tiny trend line for tiles.
function sparkSVG(vals, w = 96, h = 28) {
  if (vals.length < 2 || !vals.some(v => v)) return '';
  const mx = Math.max(...vals), mn = Math.min(...vals), rng = mx - mn || 1, X = i => 2 + (w - 4) * i / (vals.length - 1), Y = v => h - 3 - (h - 6) * (v - mn) / rng;
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="2,${h - 2} ${pts} ${w - 2},${h - 2}" fill="var(--accent-soft)" stroke="none"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(vals.length - 1)}" cy="${Y(vals[vals.length - 1])}" r="3" fill="var(--accent)"/></svg>`;
}

// Whole numbers and whole-dollar tiles count up when a page opens.
function countUps(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('.kpi .v, .big-n', root).forEach(el => {
    const m = /^(\$?)([\d,]+)$/.exec(el.textContent.trim()); if (!m) return;
    const end = +m[2].replace(/,/g, ''), pre = m[1]; if (end < 5) return;
    const t0 = performance.now(), dur = 600;
    const step = t => { const k = Math.min(1, (t - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - k, 3))); el.textContent = pre + v.toLocaleString(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
