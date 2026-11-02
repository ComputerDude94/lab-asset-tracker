// Dependency-free SVG charts (work offline on a network share) + the chart-builder data layer.
const CHART_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];
const seriesColor = (name, i) => name === 'Windows' ? CHART_COLORS[0] : name === 'Mac' ? CHART_COLORS[1] : (name === 'Other' || name === 'Other (grouped)') ? CHART_COLORS[7] : CHART_COLORS[i % CHART_COLORS.length];
const trunc = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s);

function niceScale(max, n = 5) {
  if (!(max > 0)) return { max: 1, ticks: [0, .25, .5, .75, 1] };
  const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks = []; for (let v = 0; v < max + step * 0.999; v += step) ticks.push(+v.toFixed(10));
  return { max: ticks[ticks.length - 1], ticks };
}
const fmtVal = (v, money) => money ? '$' + compact(v) : compact(v);
const fmtFull = (v, money) => money ? money_(v) : fmtNum(v);
const money_ = v => money(v);

function legendSVG(names, W, x0, y0) {
  let x = x0, y = y0, out = '';
  names.forEach((n, i) => {
    const w = 22 + String(n).length * 6.6 + 14;
    if (x + w > W - 10 && x > x0) { x = x0; y += 18; }
    out += `<rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="${seriesColor(n, i)}"/><text x="${x + 15}" y="${y}" font-size="12" fill="var(--text)">${esc(trunc(n, 28))}</text>`;
    x += w;
  });
  return { svg: out, h: y - y0 + 18 };
}
const tipAttr = t => ` class="mark" data-tip="${esc(t)}"`;

function barSVG(spec, horiz) {
  const { labels, series, money } = spec, n = labels.length, multi = series.length > 1;
  const stacked = multi && spec.stacked !== false;
  const totals = labels.map((_, i) => stacked ? sum(series, s => s.values[i] || 0) : Math.max(...series.map(s => s.values[i] || 0)));
  const sc = niceScale(Math.max(...totals));
  const W = 760; let out = '';
  const leg = multi ? legendSVG(series.map(s => s.name), W, 12, 16) : { svg: '', h: 0 };
  const tip = (i, s) => `${labels[i]}${multi ? ' · ' + s.name : ''}: ${fmtFull(s.values[i], money)}`;
  if (!horiz) {
    const rot = n > 7, m = { l: 56, r: 12, t: 12 + leg.h, b: rot ? 86 : 40 }, H = 340 + leg.h;
    const iw = W - m.l - m.r, ih = H - m.t - m.b, band = iw / n, bw = Math.min(56, band * 0.72);
    out += leg.svg;
    sc.ticks.forEach(t => { const y = m.t + ih - t / sc.max * ih; out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width="1"/><text x="${m.l - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtVal(t, money)}</text>`; });
    labels.forEach((lb, i) => {
      const cx = m.l + band * i + band / 2, x0 = cx - bw / 2;
      if (stacked) {
        let acc = 0;
        series.forEach((s, si) => {
          const v = s.values[i] || 0; if (!v) return;
          const h = v / sc.max * ih, y = m.t + ih - (acc + v) / sc.max * ih; acc += v;
          out += `<rect${tipAttr(tip(i, s))} x="${x0}" y="${y}" width="${bw}" height="${Math.max(0, h - 2)}" rx="3" fill="${seriesColor(s.name, si)}"/>`;
        });
        if (n <= 14 && totals[i]) out += `<text x="${cx}" y="${m.t + ih - totals[i] / sc.max * ih - 5}" text-anchor="middle" font-size="11" fill="var(--text)">${fmtVal(totals[i], money)}</text>`;
      } else {
        const gw = bw / series.length;
        series.forEach((s, si) => {
          const v = s.values[i] || 0, h = v / sc.max * ih, x = x0 + gw * si;
          out += `<rect${tipAttr(tip(i, s))} x="${x}" y="${m.t + ih - h}" width="${Math.max(1, gw - 2)}" height="${h}" rx="3" fill="${seriesColor(s.name, si)}"/>`;
          if (n <= 14 && !multi && v) out += `<text x="${x + gw / 2}" y="${m.t + ih - h - 5}" text-anchor="middle" font-size="11" fill="var(--text)">${fmtVal(v, money)}</text>`;
        });
      }
      const ty = m.t + ih + 16;
      out += rot ? `<text transform="translate(${cx + 4},${ty - 2}) rotate(-38)" text-anchor="end" font-size="11" fill="var(--muted)">${esc(trunc(lb, 22))}</text>` : `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(trunc(lb, 16))}</text>`;
    });
    out += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="var(--muted)"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title || 'Bar chart')}">${out}</svg>`;
  }
  const rowH = 28, m = { l: 180, r: 56, t: 10 + leg.h, b: 28 }, H = m.t + m.b + n * rowH, iw = W - m.l - m.r;
  out += leg.svg;
  sc.ticks.forEach(t => { const x = m.l + t / sc.max * iw; out += `<line y1="${m.t}" y2="${H - m.b}" x1="${x}" x2="${x}" stroke="var(--border)"/><text x="${x}" y="${H - m.b + 16}" text-anchor="middle" font-size="11" fill="var(--muted)">${fmtVal(t, money)}</text>`; });
  labels.forEach((lb, i) => {
    const y = m.t + i * rowH, bh = rowH - 8;
    out += `<text x="${m.l - 8}" y="${y + rowH / 2 + 1}" text-anchor="end" font-size="11" fill="var(--text)">${esc(trunc(lb, 24))}</text>`;
    let acc = 0;
    series.forEach((s, si) => {
      const v = s.values[i] || 0; if (!v) return;
      const w = v / sc.max * iw, x = stacked ? m.l + acc / sc.max * iw : m.l;
      if (stacked) acc += v;
      const bh2 = stacked ? bh : bh / series.length, yy = stacked ? y + 2 : y + 2 + si * bh2;
      out += `<rect${tipAttr(tip(i, s))} x="${x}" y="${yy}" width="${Math.max(1, w - (stacked ? 2 : 0))}" height="${bh2 - (stacked ? 0 : 1)}" rx="3" fill="${seriesColor(s.name, si)}"/>`;
    });
    if (totals[i]) out += `<text x="${m.l + totals[i] / sc.max * iw + 6}" y="${y + rowH / 2 + 1}" font-size="11" fill="var(--text)">${fmtVal(totals[i], money)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title || 'Bar chart')}">${out}</svg>`;
}

function lineSVG(spec) {
  const { labels, series, money } = spec, n = labels.length, multi = series.length > 1;
  const sc = niceScale(Math.max(...series.flatMap(s => s.values), 0));
  const W = 760, leg = multi ? legendSVG(series.map(s => s.name), W, 12, 16) : { svg: '', h: 0 };
  const rot = n > 8, m = { l: 56, r: 20, t: 14 + leg.h, b: rot ? 86 : 40 }, H = 340 + leg.h;
  const iw = W - m.l - m.r, ih = H - m.t - m.b, X = i => m.l + (n === 1 ? iw / 2 : iw * i / (n - 1)), Y = v => m.t + ih - v / sc.max * ih;
  let out = leg.svg;
  sc.ticks.forEach(t => { const y = Y(t); out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--border)"/><text x="${m.l - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtVal(t, money)}</text>`; });
  labels.forEach((lb, i) => {
    const x = X(i), ty = m.t + ih + 16;
    out += rot ? `<text transform="translate(${x + 4},${ty - 2}) rotate(-38)" text-anchor="end" font-size="11" fill="var(--muted)">${esc(trunc(lb, 22))}</text>` : `<text x="${x}" y="${ty}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(trunc(lb, 16))}</text>`;
  });
  series.forEach((s, si) => {
    const c = seriesColor(s.name, si);
    out += `<polyline fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" points="${s.values.map((v, i) => `${X(i)},${Y(v || 0)}`).join(' ')}"/>`;
    s.values.forEach((v, i) => {
      out += `<circle${tipAttr(`${labels[i]}${multi ? ' · ' + s.name : ''}: ${fmtFull(v || 0, money)}`)} cx="${X(i)}" cy="${Y(v || 0)}" r="4.5" fill="${c}" stroke="var(--surface)" stroke-width="2"/>`;
      if (!multi && n <= 14) out += `<text x="${X(i)}" y="${Y(v || 0) - 10}" text-anchor="middle" font-size="11" fill="var(--text)">${fmtVal(v || 0, money)}</text>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title || 'Line chart')}">${out}</svg>`;
}

function donutSVG(spec) {
  const { labels, money } = spec, vals = spec.series[0].values, total = sum(vals), W = 760, H = Math.max(300, 40 + labels.length * 24);
  const cx = 170, cy = H / 2, r1 = 130, r0 = 76;
  let a = -Math.PI / 2, out = '';
  const P = (r, t) => [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  labels.forEach((lb, i) => {
    if (!vals[i]) return;
    const da = Math.min(vals[i] / total * Math.PI * 2, Math.PI * 2 - 0.0002), a1 = a + da, large = da > Math.PI ? 1 : 0;
    const [x0, y0] = P(r1, a), [x1, y1] = P(r1, a1), [x2, y2] = P(r0, a1), [x3, y3] = P(r0, a);
    out += `<path${tipAttr(`${lb}: ${fmtFull(vals[i], money)} (${(vals[i] / total * 100).toFixed(1)}%)`)} d="M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z" fill="${seriesColor(lb, i)}" stroke="var(--surface)" stroke-width="2"/>`;
    a += da;
  });
  out += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="22" font-weight="700" fill="var(--text)">${fmtVal(total, money)}</text><text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="12" fill="var(--muted)">${esc(spec.metricLabel || 'total')}</text>`;
  const ly = (H - labels.length * 24) / 2 + 14;
  labels.forEach((lb, i) => {
    const y = ly + i * 24;
    out += `<rect x="360" y="${y - 10}" width="11" height="11" rx="2" fill="${seriesColor(lb, i)}"/><text x="379" y="${y}" font-size="12" fill="var(--text)">${esc(trunc(lb, 34))}</text><text x="${W - 14}" y="${y}" text-anchor="end" font-size="12" fill="var(--muted)">${fmtFull(vals[i], money)} · ${total ? (vals[i] / total * 100).toFixed(0) : 0}%</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title || 'Donut chart')}">${out}</svg>`;
}

function renderChart(host, spec) {
  if (!spec.labels.length || spec.series.every(s => s.values.every(v => !v))) { host.innerHTML = '<div class="empty">No data for this selection.</div>'; return; }
  const svg = spec.type === 'donut' ? donutSVG(spec) : spec.type === 'line' ? lineSVG(spec) : barSVG(spec, spec.type === 'hbar');
  host.innerHTML = `<div class="chart">${svg}</div>`;
}
function mountCharts(root) {
  $$('[data-cfg]', root).forEach(el => {
    try { const cfg = JSON.parse(el.dataset.cfg); renderChart(el, { ...computeChart(cfg), type: cfg.type, title: el.dataset.title }); }
    catch (e) { console.error(e); el.innerHTML = '<div class="empty">This chart could not be drawn.</div>'; }
  });
}
// one delegated tooltip for every chart
document.addEventListener('mouseover', e => {
  const m = e.target.closest?.('.mark'), tip = $('#tip'); if (!tip) return;
  if (!m) { tip.style.display = 'none'; return; }
  tip.textContent = m.dataset.tip; tip.style.display = 'block';
});
document.addEventListener('mousemove', e => { const tip = $('#tip'); if (tip && tip.style.display === 'block') { tip.style.left = Math.min(e.clientX + 14, innerWidth - 320) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; } });

function chartToPNG(host, name) {
  const svgEl = $('svg', host); if (!svgEl) return;
  const cs = getComputedStyle(document.documentElement);
  let s = new XMLSerializer().serializeToString(svgEl).replace(/var\((--[\w-]+)\)/g, (_, v) => cs.getPropertyValue(v).trim() || '#000');
  const vb = svgEl.viewBox.baseVal, scale = 2;
  s = s.replace('<svg ', `<svg width="${vb.width}" height="${vb.height}" font-family="Segoe UI, Arial, sans-serif" `);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = vb.width * scale; c.height = vb.height * scale;
    const g = c.getContext('2d'); g.fillStyle = cs.getPropertyValue('--surface').trim() || '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

// ---------- datasets for the chart builder ----------
const AGE_ORDER = ['<1 yr', '1–2 yrs', '2–3 yrs', '3–4 yrs', '4–5 yrs', '5+ yrs', 'Unknown'];
const ageBucket = l => { const b = ageBase(l); if (!b) return 'Unknown'; const y = yearsBetween(b, todayStr()); return y < 1 ? AGE_ORDER[0] : y >= 5 ? AGE_ORDER[5] : AGE_ORDER[Math.floor(y)]; };
const labBuilding = labId => { const lab = DB.get('labs', labId); const b = lab && DB.get('buildings', lab.buildingId); return b ? b.name : 'Unassigned'; };
const planGroup = (label, f, time) => ({ label, f: l => { const p = plannedDate(l); return p ? f(p) : 'No date'; }, time: true });
const checkInBucket = d => { if (!d.lastCheckIn) return 'Never / unknown'; const days = daysBetween(d.lastCheckIn, todayStr()); return days <= 7 ? '≤ 7 days' : days <= 30 ? '8–30 days' : days <= S().staleDays ? `31–${S().staleDays} days` : `> ${S().staleDays} days (stale)`; };
const utilBucket = u => u == null ? 'No data' : u < 25 ? '< 25%' : u < 50 ? '25–50%' : u < 75 ? '50–75%' : '75%+';

const DS = {
  hardware: {
    label: 'Hardware inventory', rows: () => DB.data.hardware.filter(isActiveLine),
    plat: l => platformOf(l), bld: l => DB.get('labs', l.labId)?.buildingId,
    metrics: { qty: { label: 'Devices (quantity)', f: l => +l.qty || 0 }, cost: { label: 'Estimated cost', f: lineCost, money: true }, value: { label: 'Current book value (depreciated)', f: bookValue, money: true }, lines: { label: 'Line items', f: () => 1 } },
    groups: {
      platform: { label: 'Platform', f: platformOf }, building: { label: 'Building', f: l => labBuilding(l.labId) },
      lab: { label: 'Lab', f: l => labLabel(DB.get('labs', l.labId)) }, model: { label: 'Model', f: modelName },
      manufacturer: { label: 'Manufacturer', f: l => getModel(l)?.manufacturer || 'Unknown' }, os: { label: 'Operating system', f: l => l.os || 'Unknown' },
      status: { label: 'Replacement status', f: lineState, order: ['Overdue', 'Due soon', 'OK', 'No date'] }, age: { label: 'Age', f: ageBucket, order: AGE_ORDER },
      funding: { label: 'Funded by', f: l => l.fundingSource || 'Unknown' }, plannedFunding: { label: 'Planned replacement funding', f: plannedFundingOf },
      ram: { label: 'RAM', f: l => getModel(l)?.ramGB ? getModel(l).ramGB + ' GB' : 'Unknown', time: true }, storage: { label: 'Storage', f: l => getModel(l)?.storageGB ? fmtStorage(getModel(l).storageGB) : 'Unknown', time: true },
      category: { label: 'Device category', f: l => getModel(l)?.category || 'Unknown' },
      purchaseFY: { label: 'Purchased – fiscal year', f: l => { const b = l.purchaseDate || l.lastReplaced; return b ? 'FY' + fiscalYear(b) : 'Unknown'; }, time: true },
      fy: planGroup('Planned replacement – fiscal year', p => 'FY' + fiscalYear(p)),
      quarter: planGroup('Planned replacement – fiscal quarter', p => `FY${fiscalYear(p)} Q${fiscalQuarter(p)}`),
      month: planGroup('Planned replacement – month', p => p.slice(0, 7)),
      lastYear: { label: 'Last replaced – year', f: l => l.lastReplaced ? l.lastReplaced.slice(0, 4) : 'Unknown', time: true },
      purchaseYear: { label: 'Purchased – year', f: l => l.purchaseDate ? l.purchaseDate.slice(0, 4) : 'Unknown', time: true }
    }
  },
  devices: {
    label: 'Managed devices (Intune / Mosyle / LabStats)', rows: () => DB.data.devices,
    plat: d => d.platform, bld: d => DB.get('labs', d.labId)?.buildingId,
    metrics: { count: { label: 'Devices', f: () => 1 } },
    groups: {
      platform: { label: 'Platform', f: d => d.platform || 'Other' }, os: { label: 'Operating system', f: d => d.os || 'Unknown' },
      osVersion: { label: 'OS version', f: d => d.osVersion || 'Unknown' }, model: { label: 'Model', f: d => d.model || 'Unknown' },
      building: { label: 'Building', f: d => labBuilding(d.labId) }, lab: { label: 'Lab', f: d => d.labId ? labLabel(DB.get('labs', d.labId)) : 'Unassigned' },
      source: { label: 'Source', f: d => d.source || 'Manual' }, checkin: { label: 'Last check-in', f: checkInBucket, order: ['≤ 7 days', '8–30 days', 'Never / unknown'] },
      assigned: { label: 'Assigned to a lab?', f: d => d.labId ? 'Assigned' : 'Unassigned' }, status: { label: 'Status', f: devStatus, order: DEVICE_STATUSES }, osSupport: { label: 'OS support', f: d => osState(d) || (osEnds(d.os) ? 'Supported' : 'No end date set'), order: ['Unsupported', 'Ending soon', 'Supported', 'No end date set'] }, purchaseYear: { label: 'Purchased – year', f: d => d.purchaseDate ? d.purchaseDate.slice(0, 4) : 'Unknown', time: true }
    }
  },
  labs: {
    label: 'Labs (incl. LabStats usage)', rows: () => DB.data.labs,
    plat: lab => labPlatforms(lab), bld: lab => lab.buildingId,
    metrics: {
      count: { label: 'Labs', f: () => 1 }, seats: { label: 'Seats', f: lab => +lab.seats || 0 },
      hours: { label: 'LabStats usage hours', f: lab => lab.usage?.hours || 0 }, sessions: { label: 'LabStats sessions', f: lab => lab.usage?.sessions || 0 },
      util: { label: 'Utilization % (sum – use with one lab per bar)', f: lab => lab.usage?.util || 0 }
    },
    groups: {
      building: { label: 'Building', f: lab => DB.get('buildings', lab.buildingId)?.name || 'Unassigned' }, department: { label: 'Department', f: lab => lab.department || 'Unknown' },
      type: { label: 'Lab type', f: lab => lab.type || 'Unknown' }, platform: { label: 'Platform', f: labPlatformText }, lab: { label: 'Lab', f: labLabel },
      utilBand: { label: 'Utilization band (LabStats)', f: lab => utilBucket(lab.usage?.util), order: ['< 25%', '25–50%', '50–75%', '75%+', 'No data'] }
    }
  },
  maintenances: {
    label: 'Maintenance & repairs', rows: () => DB.data.maintenances, plat: m => DB.get('devices', m.deviceId)?.platform || '', bld: m => DB.get('labs', m.labId)?.buildingId,
    metrics: { count: { label: 'Jobs', f: () => 1 }, cost: { label: 'Cost', f: m => +m.cost || 0, money: true } },
    groups: { type: { label: 'Type', f: m => m.type || 'Other' }, month: { label: 'Month', f: m => (m.startDate || 'Unknown').slice(0, 7), time: true }, lab: { label: 'Lab', f: m => labLabel(DB.get('labs', m.labId)) }, building: { label: 'Building', f: m => labBuilding(m.labId) }, vendor: { label: 'Vendor', f: m => m.vendor || 'Unknown' } }
  },
  software: {
    label: 'Software catalog', rows: () => DB.data.software,
    plat: s => s.platforms || [], bld: null,
    metrics: { count: { label: 'Titles', f: () => 1 }, cost: { label: 'Annual cost', f: s => +s.annualCost || 0, money: true }, labs: { label: 'Lab installs', f: s => (DB.data.labSoftware.filter(x => x.softwareId === s.id)).length } },
    groups: {
      vendor: { label: 'Vendor', f: s => s.vendor || 'Unknown' }, license: { label: 'License type', f: s => s.licenseType || 'Unknown' },
      deployment: { label: 'Deployment', f: s => s.deployment || 'Unknown' }, platform: { label: 'Platform', f: s => (s.platforms || []).length > 1 ? 'Both' : (s.platforms || [])[0] || 'Unknown' },
      title: { label: 'Title', f: s => s.name }
    }
  }
};

function computeChart(cfg) {
  const ds = DS[cfg.dataset], g = ds.groups[cfg.group] || Object.values(ds.groups)[0], m = ds.metrics[cfg.metric] || Object.values(ds.metrics)[0];
  const sp = cfg.split && cfg.split !== cfg.group && cfg.type !== 'donut' ? ds.groups[cfg.split] : null;
  const f = cfg.filters || {};
  let rows = ds.rows();
  if (f.platform) rows = rows.filter(r => [].concat(ds.plat(r)).includes(f.platform));
  if (f.buildingId && ds.bld) rows = rows.filter(r => ds.bld(r) === f.buildingId);
  const cells = new Map(), seriesTot = new Map(), labelTot = new Map();
  rows.forEach(r => {
    const k = String(g.f(r)), s = sp ? String(sp.f(r)) : m.label, v = m.f(r);
    if (!cells.has(k)) cells.set(k, new Map());
    cells.get(k).set(s, (cells.get(k).get(s) || 0) + v);
    seriesTot.set(s, (seriesTot.get(s) || 0) + v); labelTot.set(k, (labelTot.get(k) || 0) + v);
  });
  const lastish = ['No date', 'Unknown', 'Unassigned', 'No data', 'Never / unknown'];
  let labels = [...cells.keys()];
  if (g.order) labels.sort((a, b) => { const ia = g.order.indexOf(a), ib = g.order.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  else if (g.time) labels.sort((a, b) => (lastish.includes(a) - lastish.includes(b)) || cmp(a, b));
  else labels.sort((a, b) => labelTot.get(b) - labelTot.get(a) || cmp(a, b));
  const topN = cfg.topN || 12;
  let other = null;
  if (!g.order && !g.time && labels.length > topN) { other = labels.slice(topN - 1); labels = labels.slice(0, topN - 1); labels.push('Other (grouped)'); }
  let snames = [...seriesTot.keys()].sort((a, b) => seriesTot.get(b) - seriesTot.get(a) || cmp(a, b));
  if (sp && sp.order) snames.sort((a, b) => sp.order.indexOf(a) - sp.order.indexOf(b));
  let sOther = null;
  if (snames.length > 8) { sOther = snames.slice(7); snames = snames.slice(0, 7); snames.push('Other (grouped)'); }
  const val = (lb, sn) => {
    const ls = lb === 'Other (grouped)' && other ? other : [lb], ss = sn === 'Other (grouped)' && sOther ? sOther : [sn];
    return sum(ls, l => sum(ss, s => cells.get(l)?.get(s) || 0));
  };
  return { labels, series: snames.map(sn => ({ name: sn, values: labels.map(lb => val(lb, sn)) })), money: !!m.money, metricLabel: m.label, groupLabel: g.label, rowsN: rows.length };
}

const CHART_PRESETS = [
  { title: 'Planned replacement spend by fiscal year', cfg: { dataset: 'hardware', group: 'fy', split: 'platform', metric: 'cost', type: 'bar' } },
  { title: 'Replacement quantity by fiscal quarter', cfg: { dataset: 'hardware', group: 'quarter', split: 'platform', metric: 'qty', type: 'bar' } },
  { title: 'Devices by platform', cfg: { dataset: 'hardware', group: 'platform', metric: 'qty', type: 'donut' } },
  { title: 'Managed devices by operating system', cfg: { dataset: 'devices', group: 'os', metric: 'count', type: 'hbar' } },
  { title: 'Book value by building', cfg: { dataset: 'hardware', group: 'building', metric: 'value', type: 'hbar' } },
  { title: 'Devices by status', cfg: { dataset: 'devices', group: 'status', metric: 'count', type: 'donut' } },
  { title: 'Maintenance cost by type', cfg: { dataset: 'maintenances', group: 'type', metric: 'cost', type: 'donut' } },
  { title: 'Purchases by fiscal year and funding source', cfg: { dataset: 'hardware', group: 'purchaseFY', split: 'funding', metric: 'cost', type: 'bar' } },
  { title: 'Devices by RAM', cfg: { dataset: 'hardware', group: 'ram', metric: 'qty', type: 'bar' } },
  { title: 'Hardware age', cfg: { dataset: 'hardware', group: 'age', split: 'platform', metric: 'qty', type: 'bar' } },
  { title: 'Replacement status', cfg: { dataset: 'hardware', group: 'status', metric: 'qty', type: 'donut' } },
  { title: 'Estimated cost by building', cfg: { dataset: 'hardware', group: 'building', metric: 'cost', type: 'hbar' } },
  { title: 'Lab utilization (LabStats)', cfg: { dataset: 'labs', group: 'lab', metric: 'util', type: 'hbar' } },
  { title: 'Software cost by vendor', cfg: { dataset: 'software', group: 'vendor', metric: 'cost', type: 'hbar' } }
];
