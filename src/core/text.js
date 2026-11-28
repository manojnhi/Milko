/** Chhote English labels ko Proper Case me; poore vakya (hint/message) waise hi. */
export function titleCase(str) {
  const s = String(str);
  if (/[.!?](\s|$)/.test(s) || s.split(/\s+/).length > 8) return s;
  return s.replace(/(^|[\s(\/\-–—·+])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}
/** Naam/pata: "ram SINGH" -> "Ram Singh". M/S, A2 jaise chhote code waise hi. */
export function properName(str) {
  return String(str ?? '').trim().replace(/[A-Za-z][A-Za-z'./]*/g, (w) => {
    if (w.includes('/') || w.includes('.') || (w.length <= 2 && w === w.toUpperCase())) return w;
    const rest = w === w.toUpperCase() ? w.slice(1).toLowerCase() : w.slice(1);
    return w[0].toUpperCase() + rest;
  });
}
