/** RFC4180 style parser; delimiter header line se auto-detect (comma, semicolon, tab). */
export function parseCSV(text, maxRows = Infinity) {
  const t = text.replace(/^﻿/, '');
  const first = t.slice(0, t.indexOf('\n') + 1 || t.length);
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
      if (rows.length > maxRows) return rows;
    } else cell += c;
  }
  if (quoted) throw new Error('CSV has an unclosed quote');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const cellText = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Spreadsheet formula injection se bachav (sirf text values).
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** BOM ke saath taaki Excel Hindi/₹ sahi dikhaye. */
export const toCSV = (rows) => '﻿' + rows.map((r) => r.map(cellText).join(',')).join('\r\n') + '\r\n';

/** UTF-8 / UTF-16LE (BOM) bytes -> string. Invalid UTF-8 par error. */
export function decodeText(bytes) {
  const out = [];
  let chunk = [];
  const push = (code) => {
    chunk.push(code);
    if (chunk.length > 8000) { out.push(String.fromCharCode(...chunk)); chunk = []; }
  };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    for (let i = 2; i + 1 < bytes.length; i += 2) push(bytes[i] | (bytes[i + 1] << 8));
  } else {
    const bad = () => { throw new Error('File is not UTF-8 text. In Excel use "Save As > CSV UTF-8".'); };
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i++];
      if (b < 0x80) { if (b === 0) bad(); push(b); continue; }
      const n = b >= 0xf0 && b < 0xf8 ? 3 : b >= 0xe0 && b < 0xf0 ? 2 : b >= 0xc2 && b < 0xe0 ? 1 : bad();
      let cp = b & (0x3f >> n);
      for (let k = 0; k < n; k++) {
        if ((bytes[i] & 0xc0) !== 0x80) bad();
        cp = (cp << 6) | (bytes[i++] & 0x3f);
      }
      if (cp > 0xffff) { cp -= 0x10000; push(0xd800 + (cp >> 10)); push(0xdc00 + (cp & 0x3ff)); }
      else push(cp);
    }
  }
  out.push(String.fromCharCode(...chunk));
  return out.join('');
}
