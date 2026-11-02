// Minimal .xlsx writer/reader with no libraries (zip "stored" entries out; DecompressionStream for reading).
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = bytes => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const [name, content] of files) {
    const nb = enc.encode(name), data = typeof content === 'string' ? enc.encode(content) : content, crc = crc32(data);
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0), ...u16(0), ...u16(0x21), ...u16(0x58), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0)]);
    parts.push(local, nb, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nb);
    offset += local.length + nb.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
// rows: array of arrays of strings/numbers. Text goes through sharedStrings for maximum compatibility with strict readers.
function writeXlsx(rows, sheetName = 'Sheet1') {
  const sst = [], sidx = new Map();
  const si = s => { if (!sidx.has(s)) { sidx.set(s, sst.length); sst.push(s); } return sidx.get(s); };
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    if (v === '' || v == null) return '';
    const ref = colName(ci) + (ri + 1);
    return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${si(String(v))}</v></c>`;
  }).join('')}</row>`).join('');
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipStore([
    ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', X + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', X + `<workbook ${NS} xmlns:r="${R}"><sheets><sheet name="${xmlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', X + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', X + `<styleSheet ${NS}><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/sharedStrings.xml', X + `<sst ${NS} count="${sst.length}" uniqueCount="${sst.length}">${sst.map(s => `<si><t xml:space="preserve">${xmlEsc(s)}</t></si>`).join('')}</sst>`],
    ['xl/worksheets/sheet1.xml', X + `<worksheet ${NS}><sheetData>${sheetRows}</sheetData></worksheet>`]
  ]);
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzipAll(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder(), out = {};
  let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('This is not a valid .xlsx file.');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
    if (!/^xl\/(worksheets\/[^/]+\.xml|sharedStrings\.xml|workbook\.xml)$/.test(name)) continue;
    const ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), raw = b.subarray(ds, ds + csize);
    out[name] = dec.decode(method === 0 ? raw : await inflateRaw(raw));
  }
  return out;
}
// -> array of rows (arrays of strings) from the first worksheet
async function readXlsx(buf) {
  const f = await unzipAll(buf), dp = new DOMParser();
  const sheetName = Object.keys(f).filter(n => n.startsWith('xl/worksheets/')).sort()[0];
  if (!sheetName) throw new Error('No worksheet found in the file.');
  const sst = f['xl/sharedStrings.xml'] ? [...dp.parseFromString(f['xl/sharedStrings.xml'], 'application/xml').getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const rows = [];
  for (const row of dp.parseFromString(f[sheetName], 'application/xml').getElementsByTagName('row')) {
    const r = [];
    for (const c of row.getElementsByTagName('c')) {
      const col = (c.getAttribute('r') || '').replace(/\d+/g, ''); let ci = 0; for (const ch of col) ci = ci * 26 + ch.charCodeAt(0) - 64; ci = Math.max(0, ci - 1);
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      r[ci] = t === 's' ? (sst[+v] ?? '') : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map(x => x.textContent).join('') : v;
    }
    rows.push(Array.from(r, x => x ?? ''));
  }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
