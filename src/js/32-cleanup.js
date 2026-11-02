// Reports: duplicate and orphan finder with one-click merge.
const LAB_REFS = ['hardware', 'devices', 'labSoftware', 'projects', 'confirmations', 'maintenances', 'audits', 'proposals', 'techProjects'];
function mergeLabs(keep, dup) {
  LAB_REFS.forEach(t => DB.data[t].slice().forEach(r => {
    if (r.labId === dup.id) DB.put(t, { ...r, labId: keep.id });
    else if (Array.isArray(r.labIds) && r.labIds.includes(dup.id)) DB.put(t, { ...r, labIds: [...new Set(r.labIds.map(x => x === dup.id ? keep.id : x))] });
  }));
  const kw = [...new Set(`${keep.match || ''},${dup.match || ''}`.split(',').map(x => x.trim()).filter(Boolean))].join(', ');
  DB.put('labs', { ...keep, match: kw, contactIds: [...new Set([...(keep.contactIds || []), ...(dup.contactIds || [])])], name: keep.name || dup.name, department: keep.department || dup.department, notes: [keep.notes, dup.notes].filter(Boolean).join('\n') });
  DB.remove('labs', dup.id); DB.log(`Merged duplicate lab ${labLabel(dup)} into ${labLabel(keep)}`);
}
const normModel = n => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
REPORT_EXT.cleanup = host => {
  const D = DB.data, key = s => String(s || '').trim().toLowerCase(), groups = [];
  const labG = group(D.labs, l => l.buildingId + '|' + key(l.room)), devG = group(D.devices.filter(d => d.serial), d => key(d.serial)), modG = group(D.models, m => normModel(m.name));
  const cnt = (t, f, id) => D[t].filter(r => r[f] === id).length;
  labG.forEach((v, k) => v.length > 1 && groups.push({ kind: 'lab', title: `Lab: ${labLabel(v[0])}`, items: v, detail: l => `${cnt('hardware', 'labId', l.id)} hardware lines, ${cnt('devices', 'labId', l.id)} devices`, score: l => cnt('hardware', 'labId', l.id) + cnt('devices', 'labId', l.id) }));
  devG.forEach((v, k) => v.length > 1 && groups.push({ kind: 'dev', title: `Serial ${v[0].serial}`, items: v, detail: d => `${d.name || ''} · ${d.source || 'Manual'} · last seen ${d.lastCheckIn || '—'}`, score: d => Date.parse(d.lastCheckIn || '2000-01-01') || 0 }));
  modG.forEach((v, k) => k && v.length > 1 && groups.push({ kind: 'model', title: `Model: ${v[0].name}`, items: v, detail: m => `${cnt('hardware', 'modelId', m.id)} hardware lines · ${m.manufacturer || ''}`, score: m => cnt('hardware', 'modelId', m.id) }));
  const orph = [];
  const hwBad = D.hardware.filter(h => !DB.get('labs', h.labId) || (h.modelId && !DB.get('models', h.modelId))); if (hwBad.length) orph.push({ t: 'hardware', label: 'Hardware lines pointing at a missing lab or model', ids: hwBad.map(x => x.id), act: 'Delete them' });
  const lsBad = D.labSoftware.filter(x => !DB.get('labs', x.labId) || !DB.get('software', x.softwareId)); if (lsBad.length) orph.push({ t: 'labSoftware', label: 'Installed-software rows for a missing lab or title', ids: lsBad.map(x => x.id), act: 'Delete them' });
  const dvBad = D.devices.filter(x => x.labId && !DB.get('labs', x.labId)); if (dvBad.length) orph.push({ t: 'devices', label: 'Devices assigned to a lab that no longer exists', ids: dvBad.map(x => x.id), act: 'Unassign them', clear: true });
  const pjBad = D.projects.filter(x => x.labId && !DB.get('labs', x.labId)); if (pjBad.length) orph.push({ t: 'projects', label: 'Projects for a lab that no longer exists', ids: pjBad.map(x => x.id), act: 'Unlink them', clear: true });
  host.innerHTML = `<p class="muted small">Duplicates are matched on building + room (labs), serial number (devices) and model name ignoring punctuation. Merging keeps the record with the most activity, moves everything onto it and deletes the other.</p>
    ${groups.length ? groups.map((g, gi) => { const best = g.items.slice().sort((a, b) => g.score(b) - g.score(a))[0]; return `<div class="card"><div class="card-h"><h3>${esc(g.title)}</h3><span class="spacer"></span><button class="btn primary sm edit-only" data-merge="${gi}">Merge ${g.items.length} into one</button></div><table><tbody>${g.items.map(i => `<tr><td>${i === best ? '<span class="badge ok">keeps</span>' : ''}</td><td>${esc(g.kind === 'model' ? i.name : g.kind === 'dev' ? i.name : labLabel(i))}</td><td class="muted small">${esc(g.detail(i))}</td></tr>`).join('')}</tbody></table></div>`; }).join('') : '<div class="card"><div class="empty">No duplicate labs, devices or models found.</div></div>'}
    ${orph.length ? `<div class="card"><div class="card-h"><h3>Orphaned records</h3></div><table><tbody>${orph.map((o, i) => `<tr><td>${o.ids.length} · ${esc(o.label)}</td><td><button class="btn sm edit-only" data-orph="${i}">${o.act}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="card"><div class="empty">No orphaned records.</div></div>'}`;
  host.onclick = e => {
    const m = e.target.closest('[data-merge]'), o = e.target.closest('[data-orph]');
    if (m) {
      const g = groups[+m.dataset.merge], sorted = g.items.slice().sort((a, b) => g.score(b) - g.score(a)), keep = sorted[0];
      if (!confirm(`Merge ${g.items.length} records into “${g.kind === 'lab' ? labLabel(keep) : keep.name}”? The others are deleted.`)) return;
      sorted.slice(1).forEach(dup => {
        if (g.kind === 'lab') mergeLabs(keep, dup);
        else if (g.kind === 'dev') { const fill = {}; Object.keys(dup).forEach(k => { if (!/^_|^id$/.test(k) && (keep[k] === '' || keep[k] == null) && dup[k] !== '' && dup[k] != null) fill[k] = dup[k]; }); DB.put('devices', { ...keep, ...fill }); DB.remove('devices', dup.id); }
        else { D.hardware.filter(h => h.modelId === dup.id).forEach(h => DB.put('hardware', { ...h, modelId: keep.id })); DB.remove('models', dup.id); }
      });
      DB.log(`Merged ${g.items.length} duplicate ${g.kind} records`); toast('Merged'); render();
    }
    if (o) { const x = orph[+o.dataset.orph]; x.ids.forEach(id => x.clear ? DB.put(x.t, { ...DB.get(x.t, id), labId: '' }) : DB.remove(x.t, id)); DB.log(`Cleaned up ${x.ids.length} orphaned ${x.t} records`); toast('Cleaned up'); render(); }
  };
};
