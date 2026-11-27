import { write } from './tx.js';
import { fail } from './errors.js';
import { round2, parseNum, sumMoney } from './money.js';
import { isISODate, today, nowStamp } from './dates.js';
import { hashPassword, verifyPassword } from './auth.js';

export const SHIFTS = ['Morning', 'Evening'];
export const PAY_TYPES = ['payment', 'advance', 'adjustment'];
export const PAY_MODES = ['Cash', 'UPI', 'Bank', 'Cheque', 'Other'];
export const RATE_METHODS = ['fat_snf', 'fat', 'fixed'];

export const DEFAULT_SETTINGS = {
  businessName: 'Milko Dairy', address: '', phone: '', logo: '', currency: '₹',
  dateFormat: 'DD-MM-YYYY', language: 'en', unit: 'L', lockMinutes: '5',
};

const clean = (v) => String(v ?? '').trim();

export async function audit(db, user, action, entity, entityId, before, after, reason) {
  await db.runAsync(
    'INSERT INTO Audit_log (at, user, action, entity, entity_id, before_json, after_json, reason) VALUES (?,?,?,?,?,?,?,?)',
    [nowStamp(), user || null, action, entity, String(entityId ?? ''),
      before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, reason || null]);
}
export const listAudit = (db, limit = 100) => db.getAllAsync('SELECT * FROM Audit_log ORDER BY id DESC LIMIT ?', [limit]);

/* ---------- settings ---------- */
export async function getSettings(db) {
  const rows = await db.getAllAsync('SELECT key, value FROM Setting');
  return rows.reduce((a, r) => ({ ...a, [r.key]: r.value }), { ...DEFAULT_SETTINGS });
}
export async function saveSettings(db, patch) {
  if ('businessName' in patch && !clean(patch.businessName)) fail('Business name is required', 'डेयरी का नाम ज़रूरी है', 'businessName');
  if ('phone' in patch && clean(patch.phone) && !validPhone(patch.phone)) fail('Enter a valid phone number', 'सही फ़ोन नंबर डालें', 'phone');
  const current = await getSettings(db);
  if (patch.unit && patch.unit !== current.unit) {
    const c = await db.getFirstAsync('SELECT COUNT(*) c FROM Purchase');
    if (c.c > 0) fail('Milk unit cannot change after entries exist (quantities are not converted)',
      'एंट्री होने के बाद यूनिट नहीं बदल सकते (मात्रा convert नहीं होती)', 'unit');
  }
  await write(db, async () => {
    for (const [k, v] of Object.entries(patch)) {
      if (k in DEFAULT_SETTINGS) await db.runAsync('INSERT OR REPLACE INTO Setting (key, value) VALUES (?,?)', [k, clean(v)]);
    }
  });
}

/* ---------- users ---------- */
export const countUsers = async (db) => (await db.getFirstAsync('SELECT COUNT(*) c FROM tbl_User')).c;

function checkCredentials(username, password) {
  if (clean(username).length < 3) fail('Username must have at least 3 characters', 'Username कम से कम 3 अक्षर का हो', 'username');
  if (String(password).length < 6) fail('Password must have at least 6 characters', 'पासवर्ड कम से कम 6 अक्षर का हो', 'password');
  const p = String(password).toLowerCase();
  if (p === clean(username).toLowerCase() || ['123456', 'password', 'admin123'].includes(p)) {
    fail('This password is too easy to guess', 'यह पासवर्ड बहुत आसान है', 'password');
  }
}
export async function createFirstUser(db, username, password, randomBytes) {
  checkCredentials(username, password);
  if (await countUsers(db)) fail('An account already exists', 'अकाउंट पहले से बना है');
  await write(db, () => db.runAsync("INSERT INTO tbl_User (username, password, user_type) VALUES (?,?,'Admin')",
    [clean(username), hashPassword(password, randomBytes)]));
  return login(db, username, password);
}
export async function login(db, username, password) {
  const u = await db.getFirstAsync('SELECT * FROM tbl_User WHERE username = ?', [clean(username)]);
  if (!u || !verifyPassword(password, u.password)) return null;
  return { id: u.id, username: u.username, user_type: u.user_type, must_change: u.must_change };
}
export async function changeCredentials(db, userId, currentPassword, username, password, randomBytes) {
  const u = await db.getFirstAsync('SELECT * FROM tbl_User WHERE id = ?', [userId]);
  if (!u || !verifyPassword(currentPassword, u.password)) fail('Current password is wrong', 'मौजूदा पासवर्ड गलत है', 'current');
  checkCredentials(username, password);
  if (password === currentPassword) fail('Choose a different password', 'नया पासवर्ड अलग रखें', 'password');
  const other = await db.getFirstAsync('SELECT 1 x FROM tbl_User WHERE username = ? AND id <> ?', [clean(username), userId]);
  if (other) fail('Username already taken', 'यह username पहले से है', 'username');
  await write(db, async () => {
    await db.runAsync('UPDATE tbl_User SET username=?, password=?, must_change=0 WHERE id=?',
      [clean(username), hashPassword(password, randomBytes), userId]);
    await audit(db, clean(username), 'credentials', 'user', userId);
  });
  return { id: userId, username: clean(username), user_type: u.user_type, must_change: 0 };
}

/* ---------- milk types ---------- */
export const listMilkTypes = (db) => db.getAllAsync('SELECT * FROM Milk_type ORDER BY rowid');
export async function addMilkType(db, name) {
  const n = clean(name);
  if (!n || n.length > 30) fail('Enter a milk type name (max 30 characters)', 'दूध का प्रकार लिखें', 'name');
  const ex = await db.getFirstAsync('SELECT 1 x FROM Milk_type WHERE lower(name) = lower(?)', [n]);
  if (ex) fail('This milk type already exists', 'यह प्रकार पहले से है', 'name');
  await write(db, () => db.runAsync('INSERT INTO Milk_type (name) VALUES (?)', [n]));
}
export const setMilkTypeActive = (db, name, active) =>
  write(db, () => db.runAsync('UPDATE Milk_type SET active=? WHERE name=?', [active ? 1 : 0, name]));

/* ---------- milkmen ---------- */
export function validPhone(v) {
  const s = clean(v).replace(/[\s\-()]/g, '');
  return /^(\+91)?[6-9]\d{9}$/.test(s) || /^0\d{9,11}$/.test(s) || /^\+(?!91)\d{8,15}$/.test(s);
}

export function listMilkmen(db, { search = '', status = 'all', milkType = '' } = {}) {
  const where = [], args = [];
  if (status !== 'all') where.push(`active = ${status === 'active' ? 1 : 0}`);
  if (milkType) { where.push('milk_type = ?'); args.push(milkType); }
  if (clean(search)) {
    where.push("(milkman_name LIKE ? ESCAPE '\\' OR CAST(milkman_code AS TEXT) LIKE ? ESCAPE '\\' OR IFNULL(phone,'') LIKE ? ESCAPE '\\')");
    const q = `%${clean(search).replace(/[\\%_]/g, '\\$&')}%`;
    args.push(q, q, q);
  }
  return db.getAllAsync(
    `SELECT * FROM Milkman_tbl ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY milkman_code`, args);
}
export const getMilkman = (db, code) => db.getFirstAsync('SELECT * FROM Milkman_tbl WHERE milkman_code = ?', [Number(code)]);

/** Input check karke DB row banata hai (import bhi yahi use karta hai). */
export function checkMilkman(data) {
  const code = parseNum(data.milkman_code);
  if (!Number.isInteger(code) || code <= 0 || code > 999999999) fail('Code must be a positive whole number', 'कोड धनात्मक पूर्णांक होना चाहिए', 'milkman_code');
  const name = clean(data.milkman_name);
  if (!name) fail('Name is required', 'नाम ज़रूरी है', 'milkman_name');
  if (!clean(data.milk_type)) fail('Milk type is required', 'दूध का प्रकार चुनें', 'milk_type');
  if (clean(data.phone) && !validPhone(data.phone)) fail('Invalid phone number (10 digits)', 'फ़ोन नंबर गलत है (10 अंक)', 'phone');
  if (clean(data.joining_date) && !isISODate(clean(data.joining_date))) fail('Invalid joining date', 'जुड़ने की तारीख गलत है', 'joining_date');
  let custom = null;
  if (clean(data.custom_rate)) {
    custom = parseNum(data.custom_rate);
    if (!(custom > 0)) fail('Fixed rate must be above 0 (or leave it empty)', 'फिक्स रेट 0 से ज़्यादा हो (या खाली छोड़ें)', 'custom_rate');
    custom = round2(custom);
  }
  return {
    milkman_code: code, milkman_name: name, milk_type: clean(data.milk_type), phone: clean(data.phone),
    address: clean(data.address), joining_date: clean(data.joining_date), custom_rate: custom, notes: clean(data.notes),
  };
}
const MM_COLS = ['milkman_name', 'milk_type', 'phone', 'address', 'joining_date', 'custom_rate', 'notes'];

/** Transaction ke andar chalne wala insert/update. */
export async function putMilkman(db, m, before, user) {
  if (before) {
    await db.runAsync(`UPDATE Milkman_tbl SET ${MM_COLS.map((c) => c + '=?').join(', ')} WHERE milkman_code=?`,
      [...MM_COLS.map((c) => m[c]), m.milkman_code]);
  } else {
    await db.runAsync(`INSERT INTO Milkman_tbl (milkman_code, ${MM_COLS.join(', ')}) VALUES (?,${MM_COLS.map(() => '?').join(',')})`,
      [m.milkman_code, ...MM_COLS.map((c) => m[c])]);
  }
  await db.runAsync('INSERT OR IGNORE INTO Milk_type (name) VALUES (?)', [m.milk_type]);
  await audit(db, user, before ? 'update' : 'create', 'milkman', m.milkman_code, before, m);
}

/** photo: undefined = mat badlo, '' = hatao, data URI = naya. */
export async function saveMilkman(db, data, { isNew, photo, user } = {}) {
  const m = checkMilkman(data);
  await write(db, async () => {
    const before = await getMilkman(db, m.milkman_code);
    if (isNew && before) fail(`Code ${m.milkman_code} is already used`, `कोड ${m.milkman_code} पहले से है`, 'milkman_code');
    if (!isNew && !before) fail('Milkman not found', 'दूधवाला नहीं मिला');
    await putMilkman(db, m, before, user);
    if (photo === '') await db.runAsync('DELETE FROM Photo WHERE milkman_code=?', [m.milkman_code]);
    else if (photo) await db.runAsync('INSERT OR REPLACE INTO Photo (milkman_code, data) VALUES (?,?)', [m.milkman_code, photo]);
  });
  return m;
}
export const setMilkmanActive = (db, code, active, user) => write(db, async () => {
  await db.runAsync('UPDATE Milkman_tbl SET active=? WHERE milkman_code=?', [active ? 1 : 0, code]);
  await audit(db, user, active ? 'reactivate' : 'deactivate', 'milkman', code);
});
export const getPhoto = async (db, code) =>
  (await db.getFirstAsync('SELECT data FROM Photo WHERE milkman_code=?', [code]))?.data || '';
export async function nextCode(db) {
  return ((await db.getFirstAsync('SELECT MAX(milkman_code) m FROM Milkman_tbl')).m || 0) + 1;
}

/* ---------- rates ---------- */
export const listRates = (db) =>
  db.getAllAsync('SELECT * FROM Rate_tbl WHERE deleted_at IS NULL ORDER BY applicable_date DESC, rate_id DESC');

/** Latest rate whose applicable_date <= given date for that milk type. */
export const findRate = (db, date, milkType) => db.getFirstAsync(
  `SELECT * FROM Rate_tbl WHERE milk_type = ? AND applicable_date <= ? AND deleted_at IS NULL
   ORDER BY applicable_date DESC, rate_id DESC LIMIT 1`, [milkType, date]);

/** fat_snf (purana formula): fat% * fat_rate + snf% * snf_rate. fat: sirf fat. fixed: seedha ₹/unit. */
export function calcRate(rateRow, fat, snf) {
  if (!rateRow) return 0;
  if (rateRow.method === 'fixed') return round2(rateRow.fixed_rate);
  if (rateRow.method === 'fat') return round2(Number(fat) * rateRow.fat_rate);
  return round2(Number(fat) * rateRow.fat_rate + Number(snf) * rateRow.snf_rate);
}

export function checkRate(data) {
  const date = clean(data.applicable_date);
  if (!isISODate(date)) fail('Enter a valid date', 'सही तारीख डालें', 'applicable_date');
  if (!clean(data.milk_type)) fail('Milk type is required', 'दूध का प्रकार चुनें', 'milk_type');
  const method = clean(data.method) || 'fat_snf';
  if (!RATE_METHODS.includes(method)) fail('Unknown rate formula', 'रेट फॉर्मूला गलत है', 'method');
  const need = (key, label, hi) => {
    const n = parseNum(data[key]);
    if (!(n > 0)) fail(`${label} must be above 0`, `${hi} 0 से ज़्यादा हो`, key);
    return n;
  };
  return {
    applicable_date: date, milk_type: clean(data.milk_type), method,
    fat_rate: method === 'fixed' ? 0 : need('fat_rate', 'Fat rate', 'फैट रेट'),
    snf_rate: method === 'fat_snf' ? need('snf_rate', 'SNF rate', 'SNF रेट') : 0,
    fixed_rate: method === 'fixed' ? need('fixed_rate', 'Fixed rate', 'फिक्स रेट') : null,
  };
}
export async function putRate(db, r, user) {
  const res = await db.runAsync(
    'INSERT INTO Rate_tbl (applicable_date, milk_type, fat_rate, snf_rate, method, fixed_rate) VALUES (?,?,?,?,?,?)',
    [r.applicable_date, r.milk_type, r.fat_rate, r.snf_rate, r.method, r.fixed_rate]);
  await db.runAsync('INSERT OR IGNORE INTO Milk_type (name) VALUES (?)', [r.milk_type]);
  await audit(db, user, 'create', 'rate', res.lastInsertRowId, null, r);
}
export async function addRate(db, data, user) {
  const r = checkRate(data);
  await write(db, () => putRate(db, r, user));
}
/** Soft delete: purani entries ka rate waise hi rehta hai. */
export const deleteRate = (db, id, user) => write(db, async () => {
  const before = await db.getFirstAsync('SELECT * FROM Rate_tbl WHERE rate_id=?', [id]);
  await db.runAsync('UPDATE Rate_tbl SET deleted_at=? WHERE rate_id=?', [nowStamp(), id]);
  await audit(db, user, 'delete', 'rate', id, before);
});

/* ---------- purchases ---------- */
export function checkQuantities(data) {
  const qty = parseNum(data.qty), fat = parseNum(data.fat), snf = parseNum(data.snf);
  if (!(qty > 0 && qty <= 100000)) fail('Quantity must be above 0', 'मात्रा 0 से ज़्यादा हो', 'qty');
  if (!(fat >= 0 && fat <= 20)) fail('Fat % must be between 0 and 20', 'फैट % 0 से 20 के बीच हो', 'fat');
  if (!(snf >= 0 && snf <= 20)) fail('SNF % must be between 0 and 20', 'SNF % 0 से 20 के बीच हो', 'snf');
  return { qty, fat, snf };
}

/** Rate priority: milkman ka fixed rate, warna rate table. */
export async function priceEntry(db, { date, milkman, milkType, qty, fat, snf }) {
  let rate;
  if (milkman.custom_rate > 0) rate = round2(milkman.custom_rate);
  else {
    const row = await findRate(db, date, milkType);
    if (!row) fail(`No ${milkType} rate on or before ${date}. Add it in Rates.`,
      `${date} या पहले का ${milkType} रेट नहीं है। Rates में जोड़ें।`, 'rate');
    rate = calcRate(row, fat, snf);
  }
  if (!(rate > 0)) fail('Calculated rate is 0. Check Fat/SNF.', 'रेट 0 आ रहा है। Fat/SNF जाँचें।', 'rate');
  return { rate, amount: round2(parseNum(qty) * rate) };
}

export const findDuplicate = (db, { date, shift, milkman_code, milk_type }, exceptId = 0) => db.getFirstAsync(
  `SELECT * FROM Purchase WHERE deleted_at IS NULL AND date=? AND shift=? AND milkman_code=? AND milk_type=? AND id<>?`,
  [date, shift, milkman_code, milk_type, exceptId]);

export const getPurchase = (db, id) => db.getFirstAsync('SELECT * FROM Purchase WHERE id=?', [id]);

/**
 * Edit me agar date/milkman/type/fat/snf nahi badle to purana rate hi rehta hai
 * (rate table baad me badalne se purani entry chupchap nahi badalti).
 */
export async function previewPurchase(db, data, id) {
  const date = clean(data.date);
  if (!isISODate(date)) fail('Enter a valid date', 'सही तारीख डालें', 'date');
  if (!SHIFTS.includes(data.shift)) fail('Select a shift', 'शिफ्ट चुनें', 'shift');
  const milkman = await getMilkman(db, data.milkman_code);
  if (!milkman) fail('Milkman not found', 'दूधवाला नहीं मिला', 'milkman_code');
  const before = id ? await getPurchase(db, id) : null;
  if (id && (!before || before.deleted_at)) fail('Entry no longer exists', 'एंट्री मौजूद नहीं है');
  if (!milkman.active && before?.milkman_code !== milkman.milkman_code) {
    fail('This milkman is inactive', 'यह दूधवाला निष्क्रिय है', 'milkman_code');
  }
  const milkType = clean(data.milk_type) || milkman.milk_type;
  const q = checkQuantities(data);
  const keepRate = before && before.date === date && before.milkman_code === milkman.milkman_code
    && before.milk_type === milkType && before.fat === q.fat && before.snf === q.snf;
  const priced = keepRate
    ? { rate: before.rate, amount: q.qty === before.qty ? before.amount : round2(q.qty * before.rate) }
    : await priceEntry(db, { date, milkman, milkType, ...q });
  return {
    before, milkman, keptRate: !!keepRate,
    row: { date, shift: data.shift, milkman_code: milkman.milkman_code, milk_type: milkType, ...q, ...priced, remark: clean(data.remark) },
  };
}

const P_COLS = ['date', 'shift', 'milkman_code', 'milk_type', 'qty', 'fat', 'snf', 'rate', 'amount', 'remark'];
export async function putPurchase(db, row, before, user, reason) {
  if (before) {
    await db.runAsync(`UPDATE Purchase SET ${P_COLS.map((c) => c + '=?').join(', ')}, updated_at=? WHERE id=?`,
      [...P_COLS.map((c) => row[c]), nowStamp(), before.id]);
    await audit(db, user, 'update', 'purchase', before.id, before, row, reason);
    return before.id;
  }
  const res = await db.runAsync(
    `INSERT INTO Purchase (${P_COLS.join(', ')}, created_at) VALUES (${P_COLS.map(() => '?').join(',')}, ?)`,
    [...P_COLS.map((c) => row[c]), nowStamp()]);
  await audit(db, user, 'create', 'purchase', res.lastInsertRowId, null, row);
  return res.lastInsertRowId;
}

export function savePurchase(db, data, { id, user, reason, allowDuplicate } = {}) {
  return write(db, async () => {
    const { row, before } = await previewPurchase(db, data, id);
    if (before && !clean(reason)) fail('Give a reason for this change', 'बदलाव का कारण लिखें', 'reason');
    if (!allowDuplicate && await findDuplicate(db, row, id || 0)) {
      const e = new Error('duplicate'); e.code = 'DUPLICATE'; throw e;
    }
    return putPurchase(db, row, before, user, clean(reason));
  });
}

export async function deletePurchase(db, id, reason, user) {
  if (!clean(reason)) fail('Give a reason for deleting', 'डिलीट करने का कारण लिखें', 'reason');
  await write(db, async () => {
    const before = await getPurchase(db, id);
    await db.runAsync('UPDATE Purchase SET deleted_at=?, delete_reason=? WHERE id=?', [nowStamp(), clean(reason), id]);
    await audit(db, user, 'delete', 'purchase', id, before, null, clean(reason));
  });
}

export function purchaseWhere({ from, to, milkman, shift, milkType } = {}, alias = 'p') {
  const where = [`${alias}.deleted_at IS NULL`], args = [];
  const add = (cond, v) => { where.push(cond); args.push(v); };
  if (from) add(`${alias}.date >= ?`, from);
  if (to) add(`${alias}.date <= ?`, to);
  if (milkman) add(`${alias}.milkman_code = ?`, Number(milkman));
  if (shift) add(`${alias}.shift = ?`, shift);
  if (milkType) add(`${alias}.milk_type = ?`, milkType);
  return { sql: where.join(' AND '), args };
}
export function listPurchases(db, filters, limit = 0) {
  const w = purchaseWhere(filters);
  return db.getAllAsync(
    `SELECT p.*, m.milkman_name FROM Purchase p LEFT JOIN Milkman_tbl m ON m.milkman_code = p.milkman_code
     WHERE ${w.sql} ORDER BY p.date DESC, p.id DESC ${limit ? 'LIMIT ' + Number(limit) : ''}`, w.args);
}
/** SUM paise me, average fat/SNF quantity-weighted. */
export const AGG = `COUNT(*) AS n, COALESCE(SUM(p.qty),0) AS qty,
  COALESCE(SUM(CAST(ROUND(p.amount*100) AS INTEGER)),0)/100.0 AS amount,
  SUM(p.qty*p.fat)/NULLIF(SUM(p.qty),0) AS avg_fat, SUM(p.qty*p.snf)/NULLIF(SUM(p.qty),0) AS avg_snf`;
export function totalPurchases(db, filters) {
  const w = purchaseWhere(filters);
  return db.getFirstAsync(`SELECT ${AGG} FROM Purchase p WHERE ${w.sql}`, w.args);
}

/* ---------- payments ---------- */
export function checkPayment(data) {
  const date = clean(data.date);
  if (!isISODate(date)) fail('Enter a valid date', 'सही तारीख डालें', 'date');
  if (!PAY_TYPES.includes(data.type)) fail('Select a type', 'प्रकार चुनें', 'type');
  let amount = parseNum(data.amount);
  amount = Number.isNaN(amount) ? NaN : round2(amount);
  if (data.type === 'adjustment') {
    if (!amount) fail('Adjustment cannot be 0', 'एडजस्टमेंट 0 नहीं हो सकता', 'amount');
    if (!clean(data.notes)) fail('Write a note explaining the adjustment', 'एडजस्टमेंट का कारण नोट में लिखें', 'notes');
  } else if (!(amount > 0)) fail('Amount must be above 0', 'राशि 0 से ज़्यादा हो', 'amount');
  return {
    milkman_code: Number(data.milkman_code), date, type: data.type, amount,
    mode: data.type === 'adjustment' ? '' : clean(data.mode) || 'Cash', reference: clean(data.reference), notes: clean(data.notes),
  };
}
export async function addPayment(db, data, user) {
  const p = checkPayment(data);
  await write(db, async () => {
    if (!await getMilkman(db, p.milkman_code)) fail('Select a milkman', 'दूधवाला चुनें', 'milkman_code');
    const res = await db.runAsync(
      'INSERT INTO Payment (milkman_code, date, type, amount, mode, reference, notes, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [p.milkman_code, p.date, p.type, p.amount, p.mode, p.reference, p.notes, nowStamp()]);
    await audit(db, user, 'create', 'payment', res.lastInsertRowId, null, p);
  });
}
/** Payment edit nahi hota: galat ho to cancel (reason ke saath) karke naya daalo. */
export async function cancelPayment(db, id, reason, user) {
  if (!clean(reason)) fail('Give a reason for cancelling', 'कैंसल करने का कारण लिखें', 'reason');
  await write(db, async () => {
    const before = await db.getFirstAsync('SELECT * FROM Payment WHERE id=?', [id]);
    await db.runAsync('UPDATE Payment SET deleted_at=?, delete_reason=? WHERE id=?', [nowStamp(), clean(reason), id]);
    await audit(db, user, 'delete', 'payment', id, before, null, clean(reason));
  });
}
export function listPayments(db, { from, to, milkman } = {}, limit = 0) {
  const where = ['y.deleted_at IS NULL'], args = [];
  if (from) { where.push('y.date >= ?'); args.push(from); }
  if (to) { where.push('y.date <= ?'); args.push(to); }
  if (milkman) { where.push('y.milkman_code = ?'); args.push(Number(milkman)); }
  return db.getAllAsync(
    `SELECT y.*, m.milkman_name FROM Payment y LEFT JOIN Milkman_tbl m ON m.milkman_code=y.milkman_code
     WHERE ${where.join(' AND ')} ORDER BY y.date DESC, y.id DESC ${limit ? 'LIMIT ' + Number(limit) : ''}`, args);
}

/**
 * Balance (dairy ko dena baaki) = opening + doodh khareed - payment - advance + adjustment.
 * Negative = milkman ke paas advance hai.
 */
export async function balances(db, { from = '', to = '', milkman } = {}) {
  const end = to || '9999-12-31', start = from || '0000-01-01';
  const code = milkman ? Number(milkman) : null;
  const paise = (expr) => `COALESCE(SUM(CAST(ROUND((${expr})*100) AS INTEGER)),0)`;
  const buys = await db.getAllAsync(
    `SELECT milkman_code,
       ${paise('CASE WHEN date < ? THEN amount ELSE 0 END')} AS before_p,
       ${paise('CASE WHEN date >= ? THEN amount ELSE 0 END')} AS in_p
     FROM Purchase WHERE deleted_at IS NULL AND date <= ? ${code ? 'AND milkman_code = ?' : ''} GROUP BY milkman_code`,
    [start, start, end, ...(code ? [code] : [])]);
  const pays = await db.getAllAsync(
    `SELECT milkman_code, type, ${paise('CASE WHEN date < ? THEN amount ELSE 0 END')} AS before_p,
       ${paise('CASE WHEN date >= ? THEN amount ELSE 0 END')} AS in_p
     FROM Payment WHERE deleted_at IS NULL AND date <= ? ${code ? 'AND milkman_code = ?' : ''} GROUP BY milkman_code, type`,
    [start, start, end, ...(code ? [code] : [])]);
  const names = new Map((await listMilkmen(db)).map((m) => [m.milkman_code, m.milkman_name]));
  const map = new Map();
  const get = (c) => {
    if (!map.has(c)) map.set(c, { milkman_code: c, name: names.get(c) || '?', opening: 0, purchase: 0, payment: 0, advance: 0, adjustment: 0 });
    return map.get(c);
  };
  buys.forEach((b) => { const r = get(b.milkman_code); r.opening += b.before_p; r.purchase += b.in_p; });
  pays.forEach((p) => {
    const r = get(p.milkman_code);
    r.opening += p.type === 'adjustment' ? p.before_p : -p.before_p;
    r[p.type] += p.in_p;
  });
  return [...map.values()].sort((a, b) => a.milkman_code - b.milkman_code).map((r) => {
    const closing = r.opening + r.purchase - r.payment - r.advance + r.adjustment;
    const out = { ...r, closing };
    for (const k of ['opening', 'purchase', 'payment', 'advance', 'adjustment', 'closing']) out[k] /= 100;
    return out;
  });
}

export async function dashboard(db, date = today()) {
  const t = await totalPurchases(db, { from: date, to: date });
  const morning = await totalPurchases(db, { from: date, to: date, shift: 'Morning' });
  const evening = await totalPurchases(db, { from: date, to: date, shift: 'Evening' });
  const active = (await db.getFirstAsync('SELECT COUNT(*) c FROM Milkman_tbl WHERE active = 1')).c;
  const bal = await balances(db, { to: date });
  const due = bal.filter((b) => b.closing > 0);
  return {
    today: t, morning, evening, active,
    pending: sumMoney(due.map((b) => b.closing)), pendingCount: due.length,
    recent: await listPurchases(db, {}, 8),
    // Purane app me date free-text thi; galat format wali entries date reports me nahi aatin.
    badDates: await db.getAllAsync(
      `SELECT id, date, milkman_code FROM Purchase WHERE deleted_at IS NULL
       AND date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' ORDER BY id LIMIT 20`),
  };
}
