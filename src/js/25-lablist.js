// Bulk-create buildings + labs from a simple list (Building, Room, Lab name, Department, Equipment, Notes).
// Includes the West Chester University campus lab list (wcupa.edu/infoServices/techFee/techLabs.aspx, page last updated 12/5/23).
const WCU_LABS = (() => {
  const L = [], add = (b, room, name, dept, eq, notes) => L.push({ building: b, room, name: name || '', department: dept || '', equipment: eq || '', notes: notes || '' });
  const A = '201 Carter Drive', B = '25 University Ave', MS = 'Math and Computer Science major students only';
  add(A, 'Suite 400, Room 420', 'Speech and Hearing Lab', 'Communication Sciences and Disorders', 'Windows', 'Communicative Disorders majors only');
  [['103', '', 'Mathematics', 'Windows'], ['105', 'Math Tutor Center', 'Mathematics', 'Windows'], ['109', '', 'Mathematics', 'Windows'], ['139', '', 'Computer Science', 'Windows'], ['141', '', 'Computer Science', 'Windows'], ['147', '', 'Computer Science', 'Macs']].forEach(r => add(B, r[0], r[1], r[2], r[3], MS));
  ['101', '102', '104', '315'].forEach(r => add('Anderson', r, '', '', 'Windows'));
  [['113', 'Geography and Planning'], ['115', 'Geography and Planning'], ['322', ''], ['324', '']].forEach(r => add('BPMC', r[0], '', r[1], 'Windows'));
  add('Brandywine Hall', '6', 'TV Studio Lab', 'Digital Media Center', 'Macs', 'Hours 8:00am-4:30pm; availability may vary, call first');
  [['42', 'Art iMac Lab', 'Art + Design'], ['45', 'Art iMac Lab', 'Art + Design'], ['111', 'iMac Lab', 'Theatre & Dance'], ['157', 'Photography iMac Lab', 'Art + Design']].forEach(r => add('E. O. Bull Center', r[0], r[1], r[2], 'Macs'));
  ['1st Floor Children\'s Collection', '1st Floor IMC', '1st Floor Periodicals', '2nd Floor Computers', '2nd Floor Government Documents', '2nd Floor Reference Books & Reading Room', 'Library 3rd, 4th, and 5th Floor'].forEach(r => add('FHG Library', r, '', 'Library', 'Windows'));
  add('Lawrence Hall', '223', 'LARC Tutoring Lab', 'LARC', 'Windows', 'Mon-Fri 8:00am-4:30pm');
  add('Lawrence Hall', '225', 'Career Development Center', 'Twardowski Career Development Center', 'Windows', 'Mon-Fri 8:00am-4:30pm');
  add('Merion Science Center', '224', 'Geology', 'Geology & Astronomy', 'Windows | Printer', 'Mon-Fri 8:15am-6:00pm');
  ['3', '5'].forEach(r => add('Mitchell Hall', r, 'Language Lab', 'Languages & Cultures', 'Windows', 'Mon-Fri 8:15am-6:00pm'));
  add('Recitation Hall', '110', 'iMac Lab', 'College of Education', 'Macs');
  add('Ruby Jones', '6', 'Open Lab', 'Political Science', 'Windows');
  ['174', '386'].forEach(r => add('Science Complex North', r, 'Biology Lab', 'Biology', 'Macs'));
  add('Science Complex South', '101/103', 'Chemistry Lab', 'Chemistry', 'Windows', 'Chemistry students only; 24/7 key code and card swipe');
  add('Science Complex South', '314', 'Chemistry Lab', 'Chemistry', 'Windows', 'Chemistry students only');
  [['122', '', 'Kinesiology'], ['125', '', 'Kinesiology'], ['126', 'Computer Lab', 'Kinesiology'], ['224A', 'Sports Medicine', 'Sports Medicine']].forEach(r => add('Sturzebecker Health Sciences Center', r[0], r[1], r[2], 'Windows'));
  add('Swope Music Building', '121', 'Presser Music Library', 'Library', 'Windows');
  add('Swope Music Building', '252', '', 'School of Music', 'Macs');
  add('Swope Music Building', '342', '', 'Center for Music Technology', 'Macs');
  add('Sykes Student Union', 'Commuter Lounge Area', '', 'Sykes Student Union', '', 'Mon-Fri 7am-midnight, Sat 8am-midnight, Sun 10am-midnight');
  add('Sykes Student Union', '3rd Floor Computer Lab', '', 'Sykes Student Union', '', 'Mon-Fri 7am-11:45pm, Sat 8am-11:45pm, Sun 10am-11:45pm');
  add('Sykes Student Union', '302A', 'Student Lab', 'Sykes Student Union', 'Windows | Macs');
  return L;
})();

function applyLabList(rows) {
  const lc = s => String(s || '').toLowerCase().trim(); let nb = 0, nl = 0, skip = 0;
  rows.forEach(o => {
    if (!o.building || !o.room) { skip++; return; }
    let b = DB.data.buildings.find(x => lc(x.name) === lc(o.building) || (x.code && lc(x.code) === lc(o.building))); if (!b) { b = DB.put('buildings', { name: o.building, code: '' }); nb++; }
    if (DB.data.labs.some(l => l.buildingId === b.id && lc(l.room) === lc(o.room))) { skip++; return; }
    const note = [o.equipment && `Listed equipment: ${o.equipment}`, o.notes].filter(Boolean).join('. ');
    DB.put('labs', { buildingId: b.id, room: o.room, name: o.name, department: o.department, type: /library/i.test(o.department) ? 'Library' : 'Computer lab', status: 'Active', match: '', notes: note }); nl++;
  });
  return { nb, nl, skip };
}

function labListImport(host) {
  const draw = () => {
    host.innerHTML = `<div class="card"><p class="small muted">Creates buildings and empty labs (no devices) so you can attach hardware, contacts and software afterwards. Labs already in the tracker (same building + room) are skipped.</p>
    <h3>West Chester University campus labs</h3>
    <p class="small muted">${WCU_LABS.length} labs in ${new Set(WCU_LABS.map(l => l.building)).size} buildings, from the Technology Fee “Campus Computer Labs” page (last updated 12/5/23 – the page itself warns it may be out of date). Review and correct rooms after loading.</p>
    <p><button class="btn primary edit-only" id="wcu">Add WCU campus labs</button></p>
    <h3 style="margin-top:16px">Or from your own list</h3>
    <p class="small muted">CSV with headings: <b>Building, Room, Lab name, Department, Equipment, Notes</b>.</p>
    ${dropHTML('Drop a CSV of buildings and rooms.')}<div id="ll"></div></div>`;
    const done = r => { DB.log(`Added ${r.nl} labs and ${r.nb} buildings from a lab list`); toast(`Added ${r.nl} labs, ${r.nb} buildings${r.skip ? ` (${r.skip} skipped)` : ''}`); location.hash = '#/labs'; };
    $('#wcu', host).onclick = () => done(applyLabList(WCU_LABS));
    bindDrop(host, text => {
      const p = csvToObjects(text), h = k => p.headers.find(x => lc2(x) === k) || '';
      const rows = p.rows.map(r => ({ building: r[h('building')], room: r[h('room')] || r[h('room #')], name: r[h('lab name')] || r[h('name')], department: r[h('department')], equipment: r[h('equipment')], notes: r[h('notes')] }));
      if (!rows.some(r => r.building && r.room)) return toast('Need Building and Room columns', 'err');
      done(applyLabList(rows));
    });
  };
  const lc2 = s => String(s).toLowerCase().trim();
  draw();
}
