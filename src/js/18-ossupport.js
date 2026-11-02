// OS support tracking: vendor end-of-support dates (editable in Settings) + per-model "can it run the current OS?" flag.
const osRules = () => (S().osSupport || []).filter(r => r.match && r.ends);
function osEnds(os) { const o = String(os || '').toLowerCase(); const r = osRules().find(r => o.includes(r.match.toLowerCase())); return r ? r.ends : ''; }
function osState(d) {
  const e = osEnds(d.os); if (!e) return ''; const t = todayStr();
  return e < t ? 'Unsupported' : e <= addMonths(t, 12) ? 'Ending soon' : '';
}
const osBadge = d => { const s = osState(d); return s ? ` <span class="badge ${s === 'Unsupported' ? 'bad' : 'warn'}" title="Support ends ${fmtDate(osEnds(d.os))}">${s === 'Unsupported' ? 'OS unsupported' : 'OS ending'}</span>` : ''; };
const modelCannotUpgrade = d => { const m = DB.data.models.find(x => x.name.toLowerCase() === (d.model || '').toLowerCase()); return m?.osUpgradable === 'No'; };
// 0..1: share of a lab's managed devices on an unsupported OS, weighted up when they also can't be upgraded
function labOsRisk(lab) {
  const devs = devicesByLab().get(lab.id) || []; if (!devs.length) return 0;
  const bad = devs.filter(d => osState(d) === 'Unsupported').length, stuck = devs.filter(d => osState(d) && modelCannotUpgrade(d)).length;
  return Math.min(1, bad / devs.length * 0.7 + stuck / devs.length * 0.3);
}
const osRulesText = () => osRules().map(r => `${r.match} | ${r.ends}`).join('\n');
const parseOsRules = t => t.split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0] && /^\d{4}-\d{2}-\d{2}$/.test(p[1] || '')).map(p => ({ match: p[0], ends: p[1] }));
function osSupportReport(host) {
  const by = group(DB.data.devices.filter(d => devStatus(d) !== 'Archived'), d => d.os || 'Unknown');
  const rows = [...by].map(([os, ds]) => ({ os, n: ds.length, ends: osEnds(os), stuck: ds.filter(modelCannotUpgrade).length, state: ds[0] ? osState(ds[0]) : '' })).sort((a, b) => cmp(a.ends || '9999', b.ends || '9999'));
  host.innerHTML = `<p class="muted small">End-of-support dates come from <b>Settings → Planning rules → OS support dates</b> (Windows 10 is preloaded). Mark models that cannot run the current OS on the Models page (“Can upgrade OS?”) – devices that are both on an unsupported OS and on such a model are pushed to the top of the budget planner.</p>
  <div class="tbl-wrap"><table><thead><tr><th>Operating system</th><th class="num">Devices</th><th>Support ends</th><th>Status</th><th class="num">On models that can’t upgrade</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.os)}</td><td class="num">${r.n}</td><td>${r.ends ? fmtDate(r.ends) : '<span class="muted">not set</span>'}</td><td>${r.state ? `<span class="badge ${r.state === 'Unsupported' ? 'bad' : 'warn'}">${r.state}</span>` : r.ends ? '<span class="badge ok">Supported</span>' : ''}</td><td class="num">${r.stuck || ''}</td></tr>`).join('')}</tbody></table></div>`;
}
