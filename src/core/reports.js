import * as repo from './repo.js';
import { round2, sumMoney } from './money.js';
import { toMagha } from './units.js';
import { formatDate } from './dates.js';

export const REPORT_TYPES = [
  ['daily', 'Daily collection', 'रोज़ का संग्रह'],
  ['account', 'Milkman account', 'दूधवाला खाता'],
  ['rate', 'Rate / quantity', 'रेट / मात्रा'],
  ['entries', 'Entry details', 'सभी एंट्री'],
  ['ledger', 'Payment ledger', 'भुगतान खाता'],
  ['pending', 'Pending balance', 'बकाया'],
];

const col = (key, label, type = 'text') => ({ key, label, type });

/**
 * Ek hi structure screen, CSV, Excel aur PDF teeno use karte hain, isliye totals hamesha same.
 * returns { title, columns, rows, totals, summary:[{label,value,type}], note }
 */
/** units: { display: 'L'|'Magha'|'both', factor, unit } */
export async function buildReport(db, type, filters, L = (en) => en, dateFormat = 'YYYY-MM-DD', units = {}) {
  const { factor, unit = 'L' } = units;
  const display = unit === 'L' ? units.display || 'L' : 'L';
  const AGG = repo.agg(factor);
  const [, en, hi] = REPORT_TYPES.find((r) => r[0] === type);
  const w = repo.purchaseWhere(filters);
  const rep = { type, title: L(en, hi), columns: [], rows: [], totals: {}, summary: [], note: '' };
  const code = col('milkman_code', L('Code', 'कोड'), 'int'), name = col('name', L('Name', 'नाम'));
  const n = col('n', L('Entries', 'एंट्री'), 'int');
  const litreCol = col('qty', unit === 'L' ? L('Litre', 'लीटर') : 'Kg', 'num'), maghaCol = col('magha', L('Magha', 'मघा'), 'num');
  const qtyCols = display === 'Magha' ? [maghaCol] : display === 'both' ? [litreCol, maghaCol] : [litreCol];
  const per = col('per', L('Rate Per', 'भाव प्रति'));
  const perLabel = (p) => (p === 'Magha' ? L('Magha', 'मघा') : unit === 'L' ? L('Litre', 'लीटर') : 'Kg');
  const fat = col('avg_fat', L('Avg Fat', 'औसत फैट'), 'num'), snf = col('avg_snf', L('Avg SNF', 'औसत SNF'), 'num');
  const amount = col('amount', L('Amount', 'राशि'), 'money'), date = col('date', L('Date', 'तारीख'), 'date');

  const purchaseSummary = async () => {
    const t = await repo.totalPurchases(db, filters);
    rep.summary = [
      { label: L('Entries', 'एंट्री'), value: t.n, type: 'int' },
      ...qtyCols.map((c) => ({ label: `${L('Total', 'कुल')} ${c.label}`, value: round2(t[c.key]), type: 'num' })),
      { label: L('Total amount', 'कुल राशि'), value: t.amount, type: 'money' },
      { label: L('Avg Fat', 'औसत फैट'), value: round2(t.avg_fat), type: 'num' },
      { label: L('Avg SNF', 'औसत SNF'), value: round2(t.avg_snf), type: 'num' },
    ];
    rep.totals = { n: t.n, qty: t.qty, magha: t.magha, amount: t.amount, avg_fat: t.avg_fat, avg_snf: t.avg_snf };
  };

  if (type === 'daily') {
    rep.columns = [date, n, ...qtyCols, fat, snf, amount];
    rep.rows = await db.getAllAsync(`SELECT p.date, ${AGG} FROM Purchase p WHERE ${w.sql} GROUP BY p.date ORDER BY p.date`, w.args);
    await purchaseSummary();
  } else if (type === 'rate') {
    rep.columns = [col('milk_type', L('Milk type', 'प्रकार')), col('rate', L('Rate', 'रेट'), 'money'), per, n, ...qtyCols, fat, snf, amount];
    rep.rows = (await db.getAllAsync(`SELECT p.milk_type, p.rate, p.pay_unit, ${AGG} FROM Purchase p WHERE ${w.sql}
      GROUP BY p.milk_type, p.rate, p.pay_unit ORDER BY p.milk_type, p.rate`, w.args)).map((r) => ({ ...r, per: perLabel(r.pay_unit) }));
    await purchaseSummary();
  } else if (type === 'entries') {
    rep.columns = [date, col('shift', L('Shift', 'शिफ्ट')), code, name, col('milk_type', L('Milk type', 'प्रकार')), ...qtyCols,
      col('fat', 'Fat', 'num'), col('snf', 'SNF', 'num'), col('rate', L('Rate', 'रेट'), 'money'), per, amount];
    rep.rows = (await repo.listPurchases(db, filters)).reverse().map((p) => ({
      ...p, name: p.milkman_name || '?', magha: p.magha_qty ?? toMagha(p.qty, factor), per: perLabel(p.pay_unit),
    }));
    await purchaseSummary();
  } else if (type === 'ledger') {
    rep.columns = [date, code, name, col('kind', L('Type', 'प्रकार')), col('mode', L('Mode', 'तरीका')),
      col('reference', L('Reference', 'रेफ़रेंस')), col('notes', L('Notes', 'नोट')), amount];
    const labels = { payment: L('Payment', 'भुगतान'), advance: L('Advance', 'एडवांस'), adjustment: L('Adjustment', 'एडजस्टमेंट') };
    const list = (await repo.listPayments(db, filters)).reverse();
    rep.rows = list.map((p) => ({ ...p, name: p.milkman_name || '?', kind: labels[p.type] }));
    const total = (t) => sumMoney(list.filter((p) => p.type === t).map((p) => p.amount));
    rep.summary = repo.PAY_TYPES.map((t) => ({ label: labels[t], value: total(t), type: 'money' }));
    rep.note = L('Shift and milk type filters do not apply to payments. Adjustment: + increases and - reduces what is due.',
      'शिफ्ट/प्रकार फ़िल्टर भुगतान पर लागू नहीं। एडजस्टमेंट: + से बकाया बढ़ता है, - से घटता है।');
  } else {
    // account & pending: shift/type filter yahan lagana balance ko galat kar deta, isliye nahi lagta.
    let list = await repo.balances(db, { from: type === 'pending' ? '' : filters.from, to: filters.to, milkman: filters.milkman });
    if (type === 'pending') list = list.filter((r) => r.closing !== 0);
    else list = list.filter((r) => r.opening || r.purchase || r.payment || r.advance || r.adjustment);
    const stats = new Map((await db.getAllAsync(
      (() => {
        const x = repo.purchaseWhere({ from: type === 'pending' ? '' : filters.from, to: filters.to, milkman: filters.milkman });
        return `SELECT p.milkman_code, ${AGG} FROM Purchase p WHERE ${x.sql} GROUP BY p.milkman_code`;
      })(),
      repo.purchaseWhere({ from: type === 'pending' ? '' : filters.from, to: filters.to, milkman: filters.milkman }).args))
      .map((s) => [s.milkman_code, s]));
    rep.rows = list.map((r) => {
      const s = stats.get(r.milkman_code) || { n: 0, qty: 0, magha: 0 };
      return { ...r, n: s.n, qty: s.qty, magha: s.magha, avg_fat: s.avg_fat, avg_snf: s.avg_snf };
    });
    const m = (key, e, h) => col(key, L(e, h), 'money');
    const money = [m('purchase', 'Purchase', 'खरीद'), m('payment', 'Paid', 'भुगतान'), m('advance', 'Advance', 'एडवांस'),
      m('adjustment', 'Adjust', 'एडजस्ट'), m('closing', 'Balance', 'बकाया')];
    rep.columns = type === 'pending' ? [code, name, ...money]
      : [code, name, n, ...qtyCols, fat, snf, m('opening', 'Opening', 'पिछला'), ...money];
    for (const k of ['opening', 'purchase', 'payment', 'advance', 'adjustment', 'closing']) rep.totals[k] = sumMoney(rep.rows.map((r) => r[k]));
    rep.totals.n = rep.rows.reduce((a, r) => a + r.n, 0);
    rep.totals.qty = rep.rows.reduce((a, r) => a + r.qty, 0);
    rep.totals.magha = rep.rows.reduce((a, r) => a + r.magha, 0);
    rep.summary = [
      { label: L('Total purchase', 'कुल खरीद'), value: rep.totals.purchase, type: 'money' },
      { label: L('Paid + advance', 'भुगतान + एडवांस'), value: sumMoney([rep.totals.payment, rep.totals.advance]), type: 'money' },
      { label: L('Net balance', 'शेष बकाया'), value: rep.totals.closing, type: 'money' },
    ];
    rep.note = (type === 'pending' ? L('Balance of all history up to the "To" date. ', '"To" तारीख तक का कुल बकाया। ') : '')
      + L('Positive = dairy has to pay; negative = advance with milkman. Shift and milk type filters do not apply to balances.',
        'धनात्मक = डेयरी को देना है; ऋणात्मक = दूधवाले के पास एडवांस। शिफ्ट/प्रकार फ़िल्टर बकाया पर लागू नहीं।');
  }
  rep.dateFormat = dateFormat;
  return rep;
}

/** Cell ko dikhane (text) ya export (number) ke liye. */
export function cellValue(row, column, dateFormat) {
  const v = row[column.key];
  if (v === null || v === undefined) return '';
  if (column.type === 'date') return formatDate(v, dateFormat);
  if (column.type === 'num' || column.type === 'money') return round2(v);
  return v;
}

export function reportMatrix(report, meta) {
  const head = [[meta.businessName], [report.title], ...meta.filters.map((x) => [x]), [meta.generated], []];
  const headerIndex = head.length;
  const body = [report.columns.map((c) => c.label),
    ...report.rows.map((r) => report.columns.map((c) => cellValue(r, c, report.dateFormat)))];
  if (Object.keys(report.totals).length) {
    body.push(report.columns.map((c, i) => (i === 0 ? 'Total' : c.key in report.totals ? cellValue(report.totals, c, report.dateFormat) : '')));
  }
  const tail = [[], ...report.summary.map((s) => [s.label, s.value]), ...(report.note ? [[report.note]] : [])];
  return { rows: [...head, ...body, ...tail], headerRows: new Set([0, 1, headerIndex]) };
}
