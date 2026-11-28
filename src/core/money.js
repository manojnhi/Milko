// Saari money/quantity rounding yahin se hoti hai (2 decimals, half-up) taaki totals har jagah match karein.
export const round2 = (n) => {
  const v = Number(n) || 0;
  return (Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100)) / 100 || 0;
};
export const ROUNDING = ['paise', 'rupee'];
/** Entry ka amount: 'rupee' = poore rupaye (50 paise aur upar = agla rupaya), warna paise tak. */
export const roundAmount = (v, mode) => {
  const p = round2(v);
  return mode === 'rupee' ? Math.sign(p) * Math.round(Math.abs(p)) || 0 : p;
};
/** Float drift se bachne ke liye paise (integer) me jodo. */
export const sumMoney = (list) => list.reduce((a, v) => a + Math.round(round2(v) * 100), 0) / 100;
export const parseNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? '').trim().replace(',', '.');
  return /^-?(\d+(\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;
};
export const fmtNum = (n) => round2(n).toFixed(2);
/** Indian digit grouping (12,34,567.00); Intl par depend nahi. */
export const fmtMoney = (n, currency = '₹') => {
  const v = round2(n);
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  const head = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${v < 0 ? '-' : ''}${currency}${head ? head + ',' : ''}${i.slice(-3)}.${d}`;
};
