// App users: a managed list of people so edits are attributed to a chosen, known name.
const activeUsers = () => DB.data.users.filter(u => u.active !== false).sort((a, b) => cmp(a.name, b.name));
const userByName = n => DB.data.users.find(u => String(u.name).trim().toLowerCase() === String(n || '').trim().toLowerCase());

function setUser(u) {
  DB.user = u.name; try { localStorage.setItem('lt-user', u.name); } catch (e) { }
  DB.readOnly = !!DB.storeRO || u.role === 'Viewer';
  $('#btn-user').innerHTML = `<span class="avatar">${esc(initials(DB.user))}</span><span>${esc(DB.user)}${u.role === 'Viewer' ? ' (view only)' : ''}</span>`;
  document.body.classList.toggle('ro', DB.readOnly);
  updateStatus();
}

// Called after the data loads (and from the top-bar user button). Resolves when the person is identified.
function identifyUser(force) {
  return new Promise(resolve => {
    const typed = DB.user;
    if (!DB.storeRO && !DB.data.users.length && typed) { setUser(DB.put('users', { name: typed, role: 'Admin', active: true })); DB.log(`First user created: ${typed} (Admin)`); return resolve(); }
    const me = userByName(typed);
    if (!force && me && me.active !== false) { setUser(me); return resolve(); }
    const users = activeUsers(), canAdd = DB.data.settings.selfAddUsers !== false || DB.get('users', userByName(typed)?.id)?.role === 'Admin';
    const body = document.createElement('div');
    body.innerHTML = `<p class="muted small">Pick your name so changes you make are recorded against you in the history.</p>
      <div class="field"><label>I am…</label><select id="u-sel">${users.map(u => `<option value="${esc(u.id)}"${me && me.id === u.id ? ' selected' : ''}>${esc(u.name)}${u.role ? ' – ' + esc(u.role) : ''}</option>`).join('')}${canAdd && !DB.storeRO ? '<option value="__new">My name isn’t listed – add me</option>' : ''}</select></div>
      <div id="u-new" hidden><div class="field"><label>Your name</label><input id="u-name" value="${esc(me ? '' : typed)}"></div><div class="field"><label>Email (optional)</label><input id="u-email" type="email"></div></div>
      ${DB.data.settings.selfAddUsers === false ? '<p class="small muted">New users are added by an Admin under App users.</p>' : ''}
      <p class="small" style="margin-top:12px"><a href="#" id="u-folder">Change data folder…</a></p>`;
    const sel = $('#u-sel', body), nw = $('#u-new', body), sync = () => { nw.hidden = sel.value !== '__new'; }; sel.onchange = sync; sync();
    $('#u-folder', body).onclick = e => { e.preventDefault(); closeModal(); showConnect({ changing: true, saved: null }); resolve(); };
    modal({ title: force ? 'Who is editing?' : 'Who are you?', body, buttons: [{
      label: 'Continue', cls: 'primary', onClick: () => {
        let u;
        if (sel.value === '__new') {
          const name = $('#u-name', body).value.trim(); if (!name) { toast('Enter your name', 'err'); return false; }
          u = userByName(name); if (!u) { u = DB.put('users', { name, email: $('#u-email', body).value.trim(), role: 'Editor', active: true }); DB.log(`User added: ${name}`); }
          else if (u.active === false) { toast('That user is inactive – ask an Admin', 'err'); return false; }
        } else u = DB.get('users', sel.value);
        if (!u) return false;
        setUser(u); resolve(); render();
      }
    }] });
    if (!users.length && !canAdd) { toast('No users exist yet – an Admin must add you', 'err'); resolve(); }
  });
}

function userStats() {
  const m = new Map();
  const get = n => { const k = String(n || '').toLowerCase(); if (!m.has(k)) m.set(k, { edits: 0, last: '', created: 0 }); return m.get(k); };
  DB.data.audit.forEach(a => { const s = get(a.u); s.edits += (a.i && a.i.length) || 1; if (a.t > s.last) s.last = a.t; });
  TABLES.forEach(t => { if (t === 'audits' || t === 'users') return; DB.data[t].forEach(r => { if (r._c) get(r._c).created++; }); });
  return n => m.get(String(n || '').toLowerCase()) || { edits: 0, last: '', created: 0 };
}

VIEWS.users = {
  render(el) {
    const st = userStats(), selfAdd = DB.data.settings.selfAddUsers !== false;
    el.innerHTML = pageHead('App users', `<button class="btn primary edit-only" data-act="add">Add user</button>`) +
      `<p class="muted small">People who use this tracker. Everyone picks their name when they open it, and every change is recorded against that name (see “Last edited by” on each record and the change history). Roles are a convenience, not security.</p>
      <label class="check edit-only" style="margin:8px 0"><input type="checkbox" id="selfadd"${selfAdd ? ' checked' : ''}> Let people add themselves when their name isn’t listed</label><div id="t"></div>`;
    $('#selfadd', el).onchange = e => { DB.setSetting('selfAddUsers', e.target.checked); DB.log(`Self-adding users ${e.target.checked ? 'allowed' : 'turned off'}`); };
    mountTable($('#t', el), {
      id: 'users', csvName: 'app-users', rows: () => DB.data.users, rowId: r => r.id, onRow: id => editEntity('user', id), defaultSort: { k: 'name', dir: 'asc' },
      cols: [
        { k: 'name', label: 'Name', val: r => r.name, html: r => `${esc(r.name)}${r.name === DB.user ? ' <span class="badge ok">you</span>' : ''}` }, { k: 'email', label: 'Email', val: r => r.email },
        { k: 'role', label: 'Role', val: r => r.role }, { k: 'active', label: 'Status', val: r => r.active === false ? 'Inactive' : 'Active' },
        { k: 'edits', label: 'Changes made', val: r => st(r.name).edits, num: true }, { k: 'created', label: 'Records created', val: r => st(r.name).created, num: true },
        { k: 'last', label: 'Last change', val: r => st(r.name).last ? fmtDate(st(r.name).last.slice(0, 10)) : '' }]
    });
    el.onclick = e => { if (e.target.closest('[data-act="add"]')) editEntity('user'); };
  }
};
