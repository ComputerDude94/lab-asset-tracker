// Themes: a palette (shared org default, optional personal override) x a mode (auto / light / dark, personal).
const BASE_THEME = {
  light: { bg: '#f3f5f9', surface: '#ffffff', surface2: '#f6f8fb', border: '#e2e6ee', text: '#1d2736', muted: '#687487', accent: '#2563eb', 'accent-fg': '#ffffff', 'accent-soft': '#e8efff', danger: '#c62828', 'danger-soft': '#fde8e8', warn: '#b45309', 'warn-soft': '#fff1d6', ok: '#15803d', 'ok-soft': '#dcf5e5', info: '#0369a1', 'info-soft': '#e0f2fe', side: '#141c2b', side2: '#1d2739', 'side-text': '#aab5c7', 'side-head': '#6c7a91', 'nav-accent': '#60a5fa', 'logo-bg': 'linear-gradient(135deg,#3b82f6,#6366f1)', 'logo-fg': '#ffffff', c1: '#2563eb', c2: '#e07b00', c3: '#12a37f', c4: '#a64ca6', c5: '#3aa6dc', c6: '#d1432b', c7: '#7a8a2b', c8: '#6b7280' },
  dark: { bg: '#0e131b', surface: '#161d29', surface2: '#1b2432', border: '#273244', text: '#e5eaf2', muted: '#93a0b5', accent: '#6aa5ff', 'accent-fg': '#0b1220', 'accent-soft': '#1c2d4d', danger: '#ff8a80', 'danger-soft': '#3a2220', warn: '#f2c14e', 'warn-soft': '#3a3016', ok: '#6fd49a', 'ok-soft': '#173225', info: '#7cc4f0', 'info-soft': '#12303f', side: '#0a0f18', side2: '#141c2b', 'side-text': '#aab5c7', 'side-head': '#6c7a91', 'nav-accent': '#60a5fa', 'logo-bg': 'linear-gradient(135deg,#3b82f6,#6366f1)', 'logo-fg': '#ffffff', c1: '#5aa2ff', c2: '#ffa43a', c3: '#44d1a6', c4: '#d58ad5', c5: '#7cc4f0', c6: '#ff7d63', c7: '#b6c95a', c8: '#9aa0ad' }
};
const THEMES = {
  default: { name: 'Classic blue', note: 'The standard look', light: {}, dark: {} },
  wcu: {
    name: 'West Chester University', note: 'Purple and gold (wcupa.edu brand colors; no logo)',
    light: { bg: '#f6f4f8', border: '#e4dfea', surface2: '#f8f6fa', accent: '#512d6d', 'accent-soft': '#efe8f5', side: '#2b1840', side2: '#3b2556', 'side-text': '#cfc2de', 'side-head': '#9a86b3', 'nav-accent': '#ffc72c', 'logo-bg': '#ffc72c', 'logo-fg': '#512d6d', c1: '#6a3d92', c2: '#e0a100', c3: '#12a37f', c4: '#3a8fb7', c5: '#d1432b', c6: '#7a8a2b', c7: '#6b7280', c8: '#9b6b3a' },
    dark: { bg: '#140d1c', surface: '#1d1428', surface2: '#261a34', border: '#382a4a', accent: '#c6a6ee', 'accent-fg': '#1d0f2b', 'accent-soft': '#3a2552', text: '#eee8f5', muted: '#a899bd', side: '#0f0816', side2: '#1d1229', 'side-text': '#cfc2de', 'nav-accent': '#ffc72c', 'logo-bg': '#ffc72c', 'logo-fg': '#512d6d', c1: '#b48ae6', c2: '#ffc72c', c3: '#44d1a6', c4: '#6cc0e8', c5: '#ff7d63', c6: '#b6c95a', c7: '#9aa0ad', c8: '#d9a56b' }
  },
  graphite: { name: 'Graphite', note: 'Neutral and quiet', light: { accent: '#374151', 'accent-soft': '#e8eaee', 'nav-accent': '#9ca3af', side: '#1f2328', side2: '#2c3138', 'logo-bg': '#4b5563', c1: '#374151', c2: '#d97706' }, dark: { accent: '#cbd5e1', 'accent-fg': '#111827', 'accent-soft': '#2a3340', 'nav-accent': '#9ca3af', side: '#0b0d10', side2: '#171a1f', 'logo-bg': '#4b5563', c1: '#cbd5e1', c2: '#fbbf24' } },
  forest: { name: 'Forest', note: 'Green', light: { accent: '#166534', 'accent-soft': '#e3f4e8', 'nav-accent': '#4ade80', side: '#10261a', side2: '#1a3827', 'side-text': '#b4cdbc', 'logo-bg': 'linear-gradient(135deg,#22c55e,#15803d)', c1: '#15803d', c2: '#c2410c' }, dark: { accent: '#4ade80', 'accent-fg': '#052e16', 'accent-soft': '#16372a', side: '#07140d', side2: '#10241a', 'nav-accent': '#4ade80', 'logo-bg': 'linear-gradient(135deg,#22c55e,#15803d)', c1: '#4ade80', c2: '#fb923c' } },
  contrast: { name: 'High contrast', note: 'Maximum legibility', light: { bg: '#ffffff', surface2: '#f0f0f0', border: '#000000', text: '#000000', muted: '#2b2b2b', accent: '#0033cc', 'accent-soft': '#dbe5ff', side: '#000000', side2: '#222222', 'side-text': '#ffffff', 'side-head': '#dddddd', 'nav-accent': '#ffdd00', 'logo-bg': '#ffdd00', 'logo-fg': '#000000' }, dark: { bg: '#000000', surface: '#000000', surface2: '#141414', border: '#ffffff', text: '#ffffff', muted: '#dddddd', accent: '#7aa7ff', 'accent-fg': '#000000', 'accent-soft': '#16306b', side: '#000000', side2: '#222222', 'nav-accent': '#ffdd00', 'logo-bg': '#ffdd00', 'logo-fg': '#000000' } }
};
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { } };
const themeId = () => { const t = lsGet('lt-theme') || (typeof DB !== 'undefined' && DB.data?.settings?.theme) || 'wcu'; return THEMES[t] ? t : 'default'; };
const themeMode = () => lsGet('lt-mode') || 'auto';
const isDark = () => themeMode() === 'dark' || (themeMode() === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme() {
  const dark = isDark(), t = THEMES[themeId()], vars = { ...BASE_THEME[dark ? 'dark' : 'light'], ...(t[dark ? 'dark' : 'light'] || {}) }, st = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) st.setProperty('--' + k, v);
  st.colorScheme = dark ? 'dark' : 'light';
  const mb = $('#btn-mode'); if (mb) { const m = themeMode(); mb.innerHTML = ic(m === 'auto' ? 'monitor2' : m === 'dark' ? 'moon' : 'sun', 19); mb.title = `Appearance: ${m} (click to change)`; }
}
function cycleMode() { const next = { auto: 'light', light: 'dark', dark: 'auto' }[themeMode()]; lsSet('lt-mode', next === 'auto' ? '' : next); applyTheme(); toast(`Appearance: ${next === 'auto' ? 'follow system' : next}`); }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
applyTheme();

function themeCardsHTML() {
  const cur = themeId(), dark = isDark();
  return `<div class="grid g3" style="margin-bottom:12px">${Object.entries(THEMES).map(([id, t]) => {
    const v = { ...BASE_THEME[dark ? 'dark' : 'light'], ...(t[dark ? 'dark' : 'light'] || {}) };
    return `<button type="button" data-theme="${id}" class="card" style="text-align:left;cursor:pointer;margin:0;padding:10px;${id === cur ? 'outline:2px solid var(--accent);' : ''}">
      <div style="display:flex;height:64px;border-radius:8px;overflow:hidden;border:1px solid ${v.border}"><div style="width:30%;background:${v.side};padding:8px 6px"><div style="height:6px;width:70%;border-radius:3px;background:${v['nav-accent']}"></div><div style="height:5px;width:90%;margin-top:6px;border-radius:3px;background:${v['side-text']};opacity:.5"></div></div>
      <div style="flex:1;background:${v.bg};padding:8px"><div style="height:8px;width:45%;border-radius:3px;background:${v.accent}"></div><div style="display:flex;gap:4px;margin-top:8px">${['c1', 'c2', 'c3'].map(c => `<i style="flex:1;height:14px;border-radius:3px;background:${v[c]}"></i>`).join('')}</div></div></div>
      <div style="margin-top:8px"><b>${esc(t.name)}</b>${id === cur ? ' <span class="badge acc">current</span>' : ''}<div class="small muted">${esc(t.note)}</div></div></button>`;
  }).join('')}</div>`;
}
function appearanceCardHTML() {
  const mine = lsGet('lt-theme');
  return `<div class="card"><div class="card-h"><h3>Appearance</h3></div>
    <p class="small muted">Pick a look. “Everyone” sets the organization default that every user sees; “Just me” overrides it on this computer only.</p>
    <div class="toolbar"><div class="field"><label>Apply theme to</label><select id="th-scope"><option value="all">Everyone (organization default)</option><option value="me"${mine ? ' selected' : ''}>Just me</option></select></div>
    <div class="field"><label>Mode (just me)</label><select id="th-mode">${optionsHTML([{ v: 'auto', l: 'Follow my system' }, { v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }], themeMode())}</select></div>
    ${mine ? '<div class="field"><label>&nbsp;</label><span><button class="btn sm" id="th-reset" type="button">Use organization default</button></span></div>' : ''}</div>
    <div id="th-cards">${themeCardsHTML()}</div></div>`;
}
function bindAppearanceCard(root) {
  $('#th-mode', root).onchange = e => { lsSet('lt-mode', e.target.value === 'auto' ? '' : e.target.value); applyTheme(); $('#th-cards', root).innerHTML = themeCardsHTML(); };
  const rs = $('#th-reset', root); if (rs) rs.onclick = () => { lsSet('lt-theme', ''); applyTheme(); render(); };
  $('#th-cards', root).onclick = e => {
    const b = e.target.closest('[data-theme]'); if (!b) return;
    if ($('#th-scope', root).value === 'me') lsSet('lt-theme', b.dataset.theme);
    else { lsSet('lt-theme', ''); DB.setSetting('theme', b.dataset.theme); DB.log('Changed organization theme to ' + THEMES[b.dataset.theme].name); }
    applyTheme(); render();
  };
}
