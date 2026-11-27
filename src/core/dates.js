const pad = (n) => String(n).padStart(2, '0');
export const DATE_FORMATS = ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'];

/** Device ki LOCAL date. (toISOString UTC deta tha: IST me subah 5:30 se pehle kal ki date aati thi.) */
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function isISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1900 && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
export function addDays(iso, n) {
  if (!isISODate(iso)) return today();
  const t = new Date(iso + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export function formatDate(iso, fmt = 'YYYY-MM-DD') {
  if (!isISODate(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return fmt.replace('YYYY', y).replace('MM', m).replace('DD', d);
}
/** Diye gaye format ya ISO me likhi date ko ISO banata hai; invalid ho to null. */
export function parseDate(text, fmt = 'YYYY-MM-DD') {
  const s = String(text ?? '').trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]00:00(?::00(?:\.0+)?)?)?$/.exec(s);
  let y, m, d;
  if (iso) [, y, m, d] = iso;
  else {
    const p = s.split(/[-/.]/);
    if (p.length !== 3 || p.some((x) => !/^\d+$/.test(x))) return null;
    const order = fmt.split(/[-/]/);
    order.forEach((k, i) => { if (k === 'YYYY') y = p[i]; else if (k === 'MM') m = p[i]; else d = p[i]; });
    if (!y || y.length !== 4) return null;
  }
  const out = `${y}-${pad(m)}-${pad(d)}`;
  return isISODate(out) ? out : null;
}
export const nowStamp = () => new Date().toISOString();
export const localDateTime = (d = new Date()) => `${today(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
