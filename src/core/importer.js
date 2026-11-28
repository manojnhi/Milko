import { write } from './tx.js';
import { parseDate } from './dates.js';
import { round2, parseNum, roundAmount } from './money.js';
import * as repo from './repo.js';
import { factorOf, linkedRate, toMagha } from './units.js';

export const MAX_ROWS = 20000;
export const MAX_BYTES = 10 * 1024 * 1024;

const f = (key, label, required, aliases, sample, kind) => ({ key, label, required, aliases, sample, kind });
export const IMPORT_TYPES = {
  milkmen: {
    label: ['Milkmen', 'दूधवाले'],
    fields: [
      f('milkman_code', 'Code', true, ['code', 'milkmancode', 'membercode', 'id'], ['101', '102'], 'num'),
      f('milkman_name', 'Name', true, ['name', 'milkmanname', 'milkman'], ['Ramesh Kumar', 'Sita Devi']),
      f('milk_type', 'Milk Type', true, ['milktype', 'type'], ['Cow', 'Buffalo']),
      f('phone', 'Phone', false, ['phone', 'mobile', 'contact'], ['9876543210', '']),
      f('address', 'Address', false, ['address', 'village'], ['Rampur', '']),
      f('joining_date', 'Joining Date', false, ['joiningdate', 'joindate', 'doj'], ['2026-01-15', ''], 'date'),
      f('custom_rate', 'Fixed Rate', false, ['fixedrate', 'customrate'], ['', ''], 'num'),
      f('notes', 'Notes', false, ['notes', 'remark'], ['', '']),
      f('pay_unit', 'Payment Unit', false, ['paymentunit', 'unit', 'milkmantype'], ['Litre', 'Magha']),
    ],
  },
  rates: {
    label: ['Rates', 'रेट'],
    fields: [
      f('applicable_date', 'Applicable Date', true, ['applicabledate', 'date', 'fromdate'], ['2026-04-01', '2026-04-01'], 'date'),
      f('milk_type', 'Milk Type', true, ['milktype', 'type'], ['Cow', 'Buffalo']),
      f('method', 'Formula', false, ['formula', 'method'], ['fat_snf', 'fixed']),
      f('fat_rate', 'Fat Rate', false, ['fatrate'], ['6', ''], 'num'),
      f('snf_rate', 'SNF Rate', false, ['snfrate'], ['2', ''], 'num'),
      f('fixed_rate', 'Fixed Rate', false, ['fixedrate', 'rate'], ['', '60'], 'num'),
    ],
  },
  purchases: {
    label: ['Milk purchases', 'दूध खरीद'],
    fields: [
      f('date', 'Date', true, ['date'], ['2026-04-01', '2026-04-01'], 'date'),
      f('shift', 'Shift', true, ['shift', 'session'], ['Morning', 'Evening']),
      f('milkman_code', 'Code', true, ['code', 'milkmancode', 'membercode'], ['101', '102'], 'num'),
      f('milk_type', 'Milk Type', false, ['milktype', 'type'], ['Cow', 'Buffalo']),
      f('qty', 'Quantity', true, ['quantity', 'qty', 'litres', 'liters', 'ltr', 'kg'], ['10.5', '8'], 'num'),
      f('fat', 'Fat', true, ['fat', 'fatpercent'], ['4.2', '6.5'], 'num'),
      f('snf', 'SNF', true, ['snf', 'snfpercent'], ['8.5', '9'], 'num'),
      f('rate', 'Rate', false, ['rate', 'rateltr', 'rateperunit'], ['', ''], 'num'),
      f('amount', 'Amount', false, ['amount', 'total'], ['', ''], 'num'),
      f('remark', 'Remark', false, ['remark', 'notes'], ['', '']),
    ],
  },
};

export const templateRows = (type) => {
  const { fields } = IMPORT_TYPES[type];
  return [fields.map((x) => x.label), ...[0, 1].map((i) => fields.map((x) => x.sample[i]))];
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** mapping: { fieldKey: columnIndex } */
export function autoMap(type, headers) {
  const used = new Set(), map = {};
  for (const field of IMPORT_TYPES[type].fields) {
    for (const alias of [norm(field.label), ...field.aliases]) {
      const i = headers.findIndex((h, idx) => !used.has(idx) && norm(h) === alias);
      if (i >= 0) { map[field.key] = i; used.add(i); break; }
    }
  }
  return map;
}

function readNumber(text, decimal) {
  let s = String(text).trim().replace(/\s/g, '');
  if (decimal === ',') s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{2,3})*,\d{3}(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (s.includes(',')) return NaN;
  // XLSX numbers hamesha dot decimal ke saath aate hain.
  return /^-?(\d+(\.\d*)?|\.\d+)([eE]-?\d+)?$/.test(s) ? Number(s) : NaN;
}

const pause = () => new Promise((r) => setTimeout(r, 0));
const issue = (en, hi) => { const e = new Error(en); e.msg = [en, hi]; throw e; };

/**
 * rows: header ke neeche ki rows. Database me kuch nahi likhta; sirf plan banata hai.
 * options: { dateFormat, decimal: '.'|',', duplicates: 'skip'|'update', firstRowNumber, excel }
 */
export async function validateImport(db, type, rows, mapping, options, onProgress = () => {}) {
  const { fields } = IMPORT_TYPES[type];
  const missing = fields.filter((x) => x.required && mapping[x.key] === undefined);
  if (missing.length) issue(`Map these columns: ${missing.map((x) => x.label).join(', ')}`, `ये कॉलम चुनें: ${missing.map((x) => x.label).join(', ')}`);
  if (rows.length > MAX_ROWS) issue(`Too many rows (max ${MAX_ROWS}). Split the file.`, `बहुत ज़्यादा rows (अधिकतम ${MAX_ROWS})`);

  const milkmen = new Map((await repo.listMilkmen(db)).map((m) => [m.milkman_code, m]));
  const types = new Map((await repo.listMilkTypes(db)).map((t) => [t.name.toLowerCase(), t.name]));
  const rates = await repo.listRates(db); // newest first
  const existing = new Map();
  const settings = await repo.getSettings(db);
  const factor = factorOf(settings.maghaFactor);
  const prices = await db.getAllAsync('SELECT * FROM Milkman_rate WHERE deleted_at IS NULL ORDER BY applicable_date DESC, id DESC');
  if (type === 'purchases') {
    for (const p of await repo.listPurchases(db, {})) existing.set(`${p.date}|${p.shift}|${p.milkman_code}|${p.milk_type}`, p);
  } else if (type === 'rates') {
    for (const r of rates) { const k = `${r.applicable_date}|${r.milk_type}`; if (!existing.has(k)) existing.set(k, r); }
  }

  const seen = new Set();
  const result = { type, valid: [], skipped: [], failed: [] };
  const canon = (t) => types.get(String(t).toLowerCase()) || String(t).trim();

  for (let i = 0; i < rows.length; i++) {
    if (i % 200 === 0) { onProgress(i / rows.length); await pause(); }
    const raw = rows[i] || [];
    if (raw.every((c) => String(c ?? '').trim() === '')) continue;
    const line = (options.firstRowNumber || 2) + i;
    try {
      const d = {};
      for (const field of fields) {
        const col = mapping[field.key];
        let v = col === undefined ? '' : String(raw[col] ?? '').trim();
        if (v && field.kind === 'date') {
          v = parseDate(v, options.dateFormat) || issue(`${field.label}: "${v}" is not a valid ${options.dateFormat} date`, `${field.label}: तारीख "${v}" गलत है`);
        }
        if (v && field.kind === 'num') {
          // Excel number cells already use "."
          const n = options.excel && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : readNumber(v, options.decimal);
          if (Number.isNaN(n)) issue(`${field.label}: "${v}" is not a number`, `${field.label}: "${v}" संख्या नहीं है`);
          v = String(n);
        }
        if (!v && field.required) issue(`${field.label} is empty`, `${field.label} खाली है`);
        d[field.key] = v;
      }

      let key, data, before = null;
      if (type === 'milkmen') {
        d.milk_type = canon(d.milk_type);
        if (d.pay_unit) {
          const u = d.pay_unit.toLowerCase();
          d.pay_unit = ['magha', 'मघा'].includes(u) ? 'Magha' : ['l', 'ltr', 'liter', 'litre', 'लीटर'].includes(u) ? 'L'
            : issue(`Payment unit "${d.pay_unit}" must be Litre or Magha`, `यूनिट "${d.pay_unit}" लीटर या मघा हो`);
        }
        data = repo.checkMilkman(d);
        key = String(data.milkman_code);
        before = milkmen.get(data.milkman_code) || null;
        if (before) {
          // Update me jo column map nahi/khali hai, purani value rehne do.
          const merged = { ...before };
          for (const k of Object.keys(data)) if (d[k] !== '' && d[k] !== undefined) merged[k] = data[k];
          if (d.custom_rate) merged.rate_mode = 'fixed';
          data = merged;
        }
      } else if (type === 'rates') {
        d.milk_type = canon(d.milk_type);
        d.method = (d.method || (d.fixed_rate && !d.fat_rate ? 'fixed' : 'fat_snf')).toLowerCase();
        data = repo.checkRate(d);
        key = `${data.applicable_date}|${data.milk_type}`;
        before = existing.get(key) || null;
      } else {
        const shift = repo.SHIFTS.find((s) => s.toLowerCase() === d.shift.toLowerCase() || s[0].toLowerCase() === d.shift.toLowerCase()
          || (s === 'Morning' ? ['am', 'सुबह'] : ['pm', 'शाम']).includes(d.shift.toLowerCase()));
        if (!shift) issue(`Shift "${d.shift}" must be Morning or Evening`, `शिफ्ट "${d.shift}" गलत है`);
        const milkman = milkmen.get(Number(d.milkman_code));
        if (!milkman) issue(`Milkman code ${d.milkman_code} does not exist. Import milkmen first.`, `कोड ${d.milkman_code} मौजूद नहीं। पहले दूधवाले import करें।`);
        const milkType = d.milk_type ? canon(d.milk_type) : milkman.milk_type;
        const q = repo.checkQuantities(d);
        let rate = d.rate ? Number(d.rate) : 0;
        if (d.rate && !(rate > 0)) issue('Rate must be above 0', 'रेट 0 से ज़्यादा हो');
        if (!rate) {
          if (milkman.rate_mode === 'fixed' && milkman.custom_rate > 0) rate = round2(milkman.custom_rate);
          else if (milkman.rate_mode === 'own') {
            const own = prices.find((x) => x.milkman_code === milkman.milkman_code && x.applicable_date <= d.date);
            if (!own) issue(`No price for milkman ${milkman.milkman_code} on ${d.date}. Add it or map a Rate column.`, `${d.date} का भाव नहीं मिला`);
            rate = linkedRate(own, q.fat, q.snf);
          } else {
            const row = rates.find((r) => r.milk_type === milkType && r.applicable_date <= d.date);
            if (!row) issue(`No ${milkType} rate for ${d.date}. Add a rate or map a Rate column.`, `${d.date} का ${milkType} रेट नहीं मिला`);
            rate = repo.calcRate(row, q.fat, q.snf);
            if (!(rate > 0)) issue('Calculated rate is 0', 'रेट 0 आ रहा है');
          }
        }
        const payUnit = settings.unit === 'L' ? milkman.pay_unit || 'L' : 'L';
        const magha = settings.unit === 'L' ? toMagha(q.qty, factor) : null;
        const calc = roundAmount((payUnit === 'Magha' ? magha : q.qty) * rate, settings.rounding);
        let amount = calc;
        if (d.amount) {
          amount = round2(Number(d.amount));
          // 1 rupee tak ka farq rounding maana jata hai; file ka amount hi rakha jata hai.
          if (Math.abs(amount - calc) > 1) issue(`Amount ${amount} does not match Quantity × Rate (${calc})`, `राशि ${amount} मात्रा × रेट (${calc}) से मेल नहीं खाती`);
        }
        data = { date: d.date, shift, milkman_code: milkman.milkman_code, milk_type: milkType, ...q, pay_unit: payUnit, magha_qty: magha, rate: round2(rate), amount, remark: d.remark };
        key = `${data.date}|${shift}|${data.milkman_code}|${milkType}`;
        before = existing.get(key) || null;
      }

      if (seen.has(key)) result.skipped.push({ line, raw, reason: ['Duplicate inside this file', 'फ़ाइल में दोहराव'] });
      else if (before && options.duplicates !== 'update') result.skipped.push({ line, raw, reason: ['Already exists', 'पहले से मौजूद'] });
      else result.valid.push({ line, data, before, action: before ? 'update' : 'add' });
      seen.add(key);
    } catch (e) {
      result.failed.push({ line, raw, reason: e.msg || [e.message, e.message] });
    }
  }
  onProgress(1);
  return result;
}

/** Sab valid rows ek hi transaction me: beech me error aaya to kuch bhi save nahi hota. */
export async function commitImport(db, plan, user, onProgress = () => {}) {
  let added = 0, updated = 0;
  await write(db, async () => {
    for (let i = 0; i < plan.valid.length; i++) {
      if (i % 100 === 0) { onProgress(i / plan.valid.length); await pause(); }
      const { data, before, action } = plan.valid[i];
      if (plan.type === 'milkmen') await repo.putMilkman(db, data, before, user);
      else if (plan.type === 'purchases') await repo.putPurchase(db, data, before, user, 'import');
      else {
        // Rate update = naya row; purana history me rehta hai (latest id jeetta hai).
        if (before) await db.runAsync('UPDATE Rate_tbl SET deleted_at=? WHERE rate_id=?', [new Date().toISOString(), before.rate_id]);
        await repo.putRate(db, data, user);
      }
      if (action === 'add') added++; else updated++;
    }
    await repo.audit(db, user, 'import', plan.type, '', null,
      { added, updated, skipped: plan.skipped.length, failed: plan.failed.length });
  });
  onProgress(1);
  return { added, updated, skipped: plan.skipped.length, failed: plan.failed.length };
}
