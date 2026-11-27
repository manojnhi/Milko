// Chhota XLSX reader/writer (JSZip ke upar). Sirf values: formulas ka saved result padha jata hai.
const unesc = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e];
});
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (tag, name) => { const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag); return m ? unesc(m[1]) : null; };
const textOf = (xml) => {
  let out = '';
  const clean = xml.replace(/<(?:\w+:)?rPh[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let m;
  while ((m = re.exec(clean))) out += unesc(m[1]);
  return out;
};
const colIndex = (ref) => {
  let n = 0;
  for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};
const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

function serialToISO(serial, base1904) {
  const days = Math.floor(serial) + (base1904 ? 1462 : 0);
  return new Date(Date.UTC(1899, 11, 30) + days * 86400000).toISOString().slice(0, 10);
}
const isDateFormat = (id, code) => (id >= 14 && id <= 17) || id === 22 ||
  (!!code && /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')));

const MAX_XML = 60 * 1024 * 1024;
const pause = () => new Promise((r) => setTimeout(r, 0));

export async function openXlsx(JSZip, bytes) {
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error('This is not a valid .xlsx file'); }
  const read = async (path) => {
    const f = zip.file(path);
    if (!f) return '';
    if (f._data?.uncompressedSize > MAX_XML) throw new Error('Workbook is too large. Split it into smaller files.');
    return f.async('string');
  };
  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('This is not a valid .xlsx file');
  const rels = new Map((await read('xl/_rels/workbook.xml.rels')).match(/<Relationship\b[^>]*>/g)?.map((t) => [attr(t, 'Id'), attr(t, 'Target')]) || []);
  const sheets = (workbook.match(/<(?:\w+:)?sheet\b[^>]*>/g) || []).map((t) => {
    const target = rels.get(attr(t, 'r:id')) || '';
    return { name: attr(t, 'name'), path: target.startsWith('/') ? target.slice(1) : 'xl/' + target };
  });
  const base1904 = /date1904="(1|true)"/.test(workbook);
  const shared = ((await read('xl/sharedStrings.xml')).match(/<(?:\w+:)?si>[\s\S]*?<\/(?:\w+:)?si>|<(?:\w+:)?si\/>/g) || []).map(textOf);
  const styles = await read('xl/styles.xml');
  const custom = new Map((styles.match(/<numFmt\b[^>]*>/g) || []).map((t) => [Number(attr(t, 'numFmtId')), attr(t, 'formatCode')]));
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] || '';
  const dateStyle = (xfs.match(/<xf\b[^>]*>/g) || []).map((t) => {
    const id = Number(attr(t, 'numFmtId'));
    return isDateFormat(id, custom.get(id));
  });

  async function rows(name, maxRows = Infinity) {
    const sheet = sheets.find((s) => s.name === name) || sheets[0];
    const xml = await read(sheet.path);
    const out = [];
    const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
    let m, count = 0;
    while ((m = rowRe.exec(xml)) && out.length <= maxRows) {
      const index = Number(attr(m[1], 'r') || out.length + 1) - 1;
      if (index > 200000) throw new Error('Sheet has too many rows');
      while (out.length < index) out.push([]);
      const cells = [];
      const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
      let c;
      while ((c = cellRe.exec(m[2] || ''))) {
        const ref = attr(c[1], 'r');
        const col = ref ? colIndex(ref) : cells.length;
        if (col > 200) continue;
        const type = attr(c[1], 't');
        const inner = c[2] || '';
        const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
        let value = '';
        if (type === 'inlineStr') value = textOf(inner);
        else if (v !== undefined) {
          if (type === 's') value = shared[Number(v)] ?? '';
          else if (type === 'str' || type === 'e') value = unesc(v);
          else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
          else if (dateStyle[Number(attr(c[1], 's') || 0)]) value = serialToISO(Number(v), base1904);
          else value = String(Number(Number(v).toPrecision(15)));
        }
        while (cells.length < col) cells.push('');
        cells[col] = value;
      }
      out[index] = cells;
      if (++count % 2000 === 0) await pause();
    }
    return out;
  }
  return { sheetNames: sheets.map((s) => s.name), rows };
}

/** sheets: [{ name, rows: [[value]] , headerRows?: Set<number> }] ; numbers number cells bante hain. */
export async function writeXlsx(JSZip, sheets) {
  const zip = new JSZip();
  const names = sheets.map((s, i) => esc((s.name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const NS = 'http://schemas.openxmlformats.org';
  zip.file('[Content_Types].xml', `${head}<Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `${head}<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `${head}<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `${head}<Relationships xmlns="${NS}/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `${head}<styleSheet xmlns="${NS}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" xfId="0"/><xf numFmtId="0" fontId="1" xfId="0" applyFont="1"/><xf numFmtId="2" fontId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sheets.forEach((s, i) => {
    const bold = s.headerRows || new Set([0]);
    const widths = [];
    const data = s.rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
      widths[c] = Math.min(40, Math.max(widths[c] || 10, String(v ?? '').length + 2));
      if (v === '' || v === null || v === undefined) return '';
      const ref = colName(c) + (r + 1);
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${Number.isInteger(v) ? '' : ' s="2"'}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${bold.has(r) ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const cols = widths.length ? `<cols>${Array.from(widths, (w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w || 10}" customWidth="1"/>`).join('')}</cols>` : '';
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `${head}<worksheet xmlns="${NS}/spreadsheetml/2006/main">${cols}<sheetData>${data}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
