import { cellValue } from './reports.js';
import { fmtMoney, fmtNum } from './money.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const displayValue = (value, type, currency) =>
  value === '' || value === undefined || value === null ? ''
    : type === 'money' ? fmtMoney(value, currency) : type === 'num' ? fmtNum(value) : String(value);

/** A4 print HTML. thead har page par repeat hota hai; TOTAL row sirf aakhir me (tfoot nahi). */
export function buildReportHtml(report, { settings, filters, generated }) {
  const wide = report.columns.length > 8;
  const cls = (c) => (['num', 'money', 'int'].includes(c.type) ? ' class="r"' : '');
  const cell = (row, c) => esc(displayValue(cellValue(row, c, report.dateFormat), c.type, settings.currency));
  const body = report.rows.map((r) => `<tr>${report.columns.map((c) => `<td${cls(c)}>${cell(r, c)}</td>`).join('')}</tr>`).join('');
  const total = Object.keys(report.totals).length && report.rows.length
    ? `<tr class="total">${report.columns.map((c, i) => `<td${cls(c)}>${i === 0 ? 'Total' : c.key in report.totals ? cell(report.totals, c) : ''}</td>`).join('')}</tr>` : '';
  const logo = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(settings.logo || '') ? `<img src="${settings.logo}" alt="">` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.title)}</title>
<style>
@page { size: A4 ${wide ? 'landscape' : 'portrait'}; margin: 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Poppins, 'Segoe UI', Roboto, Arial, 'Noto Sans', 'Noto Sans Devanagari', sans-serif; color: #1d2433; margin: 0; font-size: ${wide ? 10 : 11}px; }
header { display: flex; gap: 12px; align-items: center; border-bottom: 2px solid #2b55b8; padding-bottom: 8px; }
header img { height: 52px; max-width: 90px; object-fit: contain; }
h1 { font-size: 18px; margin: 0; font-weight: 600; } h2 { font-size: 14px; margin: 10px 0 4px; font-weight: 600; } b { font-weight: 600; }
.meta { color: #4d5870; line-height: 1.5; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #c8d0e0; padding: 4px 5px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
th { background: #e6edfb; font-weight: 600; } .r { text-align: right; white-space: nowrap; }
.total td { font-weight: 600; background: #f2f5fb; }
.summary { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px 22px; break-inside: avoid; }
.note { margin-top: 8px; color: #4d5870; }
</style></head><body>
<header>${logo}<div><h1>${esc(settings.businessName)}</h1>
<div class="meta">${esc(settings.address)}${settings.phone ? ` · ${esc(settings.phone)}` : ''}</div></div></header>
<h2>${esc(report.title)}</h2>
<div class="meta">${filters.map(esc).join('<br>')}<br>${esc(generated)}</div>
<table><thead><tr>${report.columns.map((c) => `<th${cls(c)}>${esc(c.label)}</th>`).join('')}</tr></thead>
<tbody>${body || `<tr><td colspan="${report.columns.length}">No data</td></tr>`}${total}</tbody></table>
<div class="summary">${report.summary.map((s) => `<div>${esc(s.label)}: <b>${esc(displayValue(s.value, s.type, settings.currency))}</b></div>`).join('')}</div>
${report.note ? `<div class="note">${esc(report.note)}</div>` : ''}
</body></html>`;
}
