'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UI = { tbl: {}, memo: {}, modal: null, needsRender: false, plan: null, chart: null };

// ---------- dates (stored as YYYY-MM-DD strings) ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseD = s => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
};
const normDate = s => { s = String(s || '').trim(); if (/^(19|20)\d{2}$/.test(s)) return s + '-07-01'; const d = parseD(s); return d ? ymd(d) : ''; };    // a bare year is treated as mid-year
const addMonths = (s, m) => {
  const d = parseD(s); if (!d) return '';
  const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + m);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return ymd(d);
};
const addYears = (s, y) => addMonths(s, Math.round(y * 12));
const fmtDate = s => { const d = parseD(s); return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; };
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const yearsBetween = (a, b) => (parseD(b) - parseD(a)) / (365.25 * 864e5);
const fyStart = () => DB.data.settings.fyStartMonth || 1;
const fiscalYear = s => {
  const d = parseD(s); if (!d) return 0;
  const st = fyStart(); return (st > 1 && d.getMonth() + 1 >= st) ? d.getFullYear() + 1 : d.getFullYear();
};
const fyRange = fy => {
  const st = fyStart();
  if (st === 1) return [`${fy}-01-01`, `${fy}-12-31`];
  return [`${fy - 1}-${pad(st)}-01`, ymd(new Date(fy, st - 1, 0, 12))];
};
const fiscalQuarter = s => { const d = parseD(s); return Math.floor(((d.getMonth() + 1 - fyStart() + 12) % 12) / 3) + 1; };

// ---------- number formatting ----------
const money = n => new Intl.NumberFormat(undefined, { style: 'currency', currency: DB.data?.settings?.currency || 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtNum = n => new Intl.NumberFormat().format(Math.round((n || 0) * 10) / 10);
const compact = n => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
const pct = n => Math.round((n || 0) * 10) / 10 + '%';

// ---------- CSV ----------
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const delim = [',', '\t', ';'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
function csvToObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  return { headers, rows: rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}
function toCSV(rows) {
  return rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
}
function download(name, text, mime = 'text/csv') {
  const blob = new Blob([mime === 'text/csv' ? '﻿' + text : text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const readFileText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(f); });

// ---------- toast / modal ----------
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 8000 : 3200);
}
function closeModal() {
  if (!UI.modal) return;
  UI.modal.remove(); UI.modal = null;
  document.removeEventListener('keydown', modalKey);
  if (UI.needsRender) { UI.needsRender = false; render(); }
}
const modalKey = e => { if (e.key === 'Escape') closeModal(); };
function modal({ title, body, buttons = [], wide = false }) {
  if (UI.modal) { UI.modal.remove(); UI.modal = null; }
  const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div><div class="modal-b"></div><div class="modal-f"></div></div>`;
  const b = $('.modal-b', wrap);
  if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
  const f = $('.modal-f', wrap);
  buttons.forEach(bt => {
    const el = document.createElement('button'); el.className = 'btn ' + (bt.cls || ''); el.textContent = bt.label;
    el.onclick = async () => { const r = bt.onClick ? await bt.onClick(wrap) : true; if (r !== false) closeModal(); };
    f.appendChild(el);
  });
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(wrap); UI.modal = wrap;
  document.addEventListener('keydown', modalKey);
  const first = $('input:not([type=checkbox]),select,textarea', b); if (first) first.focus();
  return wrap;
}

// ---------- forms ----------
function optionsHTML(opts, sel) {
  return opts.map(o => {
    const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
    return `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`;
  }).join('');
}
function fieldHTML(f, val) {
  const name = `name="${f.k}"`, req = f.req ? ' required' : '';
  let input;
  switch (f.type) {
    case 'textarea': input = `<textarea ${name} rows="${f.rows || 3}">${esc(val)}</textarea>`; break;
    case 'select': {
      const o = typeof f.options === 'function' ? f.options() : f.options;
      input = `<select ${name}${req}>${f.req ? '' : '<option value=""></option>'}${optionsHTML(o, val)}</select>`; break;
    }
    case 'check': input = `<label class="chk"><input type="checkbox" ${name}${val ? ' checked' : ''}> ${esc(f.hint || '')}</label>`; break;
    case 'multi': {
      const o = f.options(), set = new Set(val || []);
      input = `<div class="multi" data-multi="${f.k}">${o.length ? o.map(x => `<label class="chk"><input type="checkbox" value="${esc(x.v)}"${set.has(x.v) ? ' checked' : ''}> ${esc(x.l)}</label>`).join('') : '<span class="muted">None available yet</span>'}</div>`; break;
    }
    case 'number': input = `<input type="number" step="${f.step || 'any'}" ${name} value="${esc(val ?? '')}"${req}${f.min != null ? ` min="${f.min}"` : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}>`; break;
    default: input = `<input type="${f.type || 'text'}" ${name} value="${esc(val ?? '')}"${req}${f.list ? ` list="${f.list}"` : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}>`;
  }
  return `<div class="field${f.wide ? ' wide' : ''}"><label>${esc(f.label)}${f.req ? ' *' : ''}</label>${input}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`;
}
function readFields(root, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'multi') { out[f.k] = $$(`[data-multi="${f.k}"] input:checked`, root).map(i => i.value); continue; }
    const el = root.querySelector(`[name="${f.k}"]`); if (!el) continue;
    if (f.type === 'check') out[f.k] = el.checked;
    else if (f.type === 'number') out[f.k] = el.value === '' ? null : parseFloat(el.value);
    else out[f.k] = el.value.trim();
  }
  return out;
}


// ---------- icons (inline, Feather-style) ----------
const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  bar: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  columns: '<path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  checkout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
  checkin: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8.01" y2="6"/><line x1="12" y1="6" x2="12.01" y2="6"/><line x1="16" y1="6" x2="16.01" y2="6"/><line x1="8" y1="10" x2="8.01" y2="10"/><line x1="12" y1="10" x2="12.01" y2="10"/><line x1="16" y1="10" x2="16.01" y2="10"/>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  monitor2: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
};
const ic = (n, size) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"${size ? ` style="font-size:${size}px"` : ''}>${ICONS[n] || ''}</svg>`;
const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

const linksHTML = t => String(t || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => /^https?:\/\//i.test(l) ? `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.length > 60 ? l.slice(0, 57) + '…' : l)}</a>` : `<span class="muted">${esc(l)}</span>`).join('<br>');
// ---------- sorting ----------
function cmp(a, b) {
  const ea = a == null || a === '', eb = b == null || b === '';
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
