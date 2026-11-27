import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { openTestDb } from './sqliteAdapter.mjs';
import { migrate, LEGACY_SCHEMA, SCHEMA_VERSION } from '../src/core/migrations.js';
import * as repo from '../src/core/repo.js';
import { pbkdf2, utf8 } from '../src/core/auth.js';
import { parseCSV, toCSV, decodeText } from '../src/core/csv.js';
import { openXlsx, writeXlsx } from '../src/core/xlsx.js';
import * as imp from '../src/core/importer.js';
import { buildReport, reportMatrix } from '../src/core/reports.js';
import { createBackup, parseBackup, restoreBackup, getSnapshot } from '../src/core/backup.js';
import { parseDate, today } from '../src/core/dates.js';
import { round2, fmtMoney, sumMoney } from '../src/core/money.js';

const JSZip = createRequire(import.meta.url)(process.env.JSZIP_PATH || 'jszip');
const rand = (n) => new Uint8Array(randomBytes(n));

function legacyDb() {
  const db = openTestDb();
  db.raw.exec(LEGACY_SCHEMA);
  db.raw.exec(`
    INSERT INTO tbl_User (username,password,user_type) VALUES ('admin','admin','Admin'), ('ravi','s3cretpw','User');
    INSERT INTO Milkman_tbl VALUES (1,'Ramesh','Cow',1), (2,'Sita','Buffalo',0), (3,'Gopal','Goat',1);
    INSERT INTO Rate_tbl (applicable_date,milk_type,fat_rate,snf_rate) VALUES ('2026-01-01','Cow',6,2), ('2026-01-01','Buffalo',7,2);
    INSERT INTO Purchase (date,shift,milkman_code,qty,fat,snf,rate,amount,remark) VALUES
      ('2026-03-01','Morning',1,10.5,4.2,8.5,42.2,443.1,'x'), ('2026-03-01','Evening',2,8,6.5,9,63.5,508,NULL),
      ('2026-03-02','Morning',99,1,4,8,40,40,'orphan');
  `);
  return db;
}
async function freshDb() {
  const db = openTestDb();
  await migrate(db, { randomBytes: rand });
  await repo.saveMilkman(db, { milkman_code: 1, milkman_name: 'Ramesh', milk_type: 'Cow' }, { isNew: true });
  await repo.addRate(db, { applicable_date: '2026-01-01', milk_type: 'Cow', fat_rate: '6', snf_rate: '2' });
  return db;
}
const entry = { date: '2026-03-01', shift: 'Morning', milkman_code: 1, qty: '10.5', fat: '4.2', snf: '8.5' };

test('legacy database migrates without losing or changing data', async () => {
  const db = legacyDb();
  const before = {};
  for (const t of ['Milkman_tbl', 'Rate_tbl', 'Purchase']) before[t] = await db.getAllAsync(`SELECT * FROM ${t}`);
  await migrate(db, { randomBytes: rand });
  for (const t of Object.keys(before)) {
    const after = await db.getAllAsync(`SELECT * FROM ${t}`);
    assert.equal(after.length, before[t].length, t);
    before[t].forEach((row, i) => { for (const k of Object.keys(row)) assert.equal(after[i][k], row[k], `${t}.${k}`); });
  }
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, SCHEMA_VERSION);
  const users = await db.getAllAsync('SELECT * FROM tbl_User ORDER BY id');
  assert.ok(users.every((u) => u.password.startsWith('pbkdf2$')));
  assert.equal((await repo.login(db, 'admin', 'admin')).must_change, 1);
  assert.equal((await repo.login(db, 'ravi', 's3cretpw')).must_change, 0);
  assert.equal(await repo.login(db, 'ravi', 'wrong'), null);
  assert.deepEqual((await db.getAllAsync('SELECT milk_type FROM Purchase ORDER BY id')).map((r) => r.milk_type), ['Cow', 'Buffalo', null]);
  assert.ok((await repo.listMilkTypes(db)).some((t) => t.name === 'Goat'));
  await migrate(db, { randomBytes: rand }); // idempotent
  assert.equal((await repo.totalPurchases(db, {})).amount, 991.1);
  await db.runAsync("UPDATE Purchase SET date='1-3-26' WHERE id=1");
  assert.deepEqual((await repo.dashboard(db, '2026-03-02')).badDates.map((r) => r.id), [1]);
});

test('failed migration rolls back completely', async () => {
  const db = legacyDb();
  await assert.rejects(migrate(db, { randomBytes: () => { throw new Error('boom'); } }), /boom/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 1);
  assert.equal((await db.getFirstAsync("SELECT password FROM tbl_User WHERE username='admin'")).password, 'admin');
  assert.ok(!(await db.getAllAsync('PRAGMA table_info(Purchase)')).some((c) => c.name === 'deleted_at'));
  await migrate(db, { randomBytes: rand });
});

test('PBKDF2 matches Node crypto', () => {
  for (const pw of ['abc', 'पासवर्ड१२३', 'x'.repeat(100)]) {
    const salt = rand(16);
    assert.equal(Buffer.from(pbkdf2(pw, salt, 25)).toString('hex'), pbkdf2Sync(utf8(pw), salt, 25, 32, 'sha256').toString('hex'));
  }
});

test('money, dates, phone', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(-1.005), -1.01);
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(fmtMoney(1234567.5), '₹12,34,567.50');
  assert.equal(fmtMoney(-999), '-₹999.00');
  assert.equal(parseDate('31/12/2026', 'DD/MM/YYYY'), '2026-12-31');
  assert.equal(parseDate('12/31/2026', 'DD/MM/YYYY'), null);
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(today(new Date(2026, 0, 5, 1, 0)), '2026-01-05');
  assert.ok(repo.validPhone('+91 98765-43210'));
  assert.ok(!repo.validPhone('12345'));
  assert.ok(!repo.validPhone('+91 12345 67890'));
});

test('milkman validation: duplicate code and bad phone', async () => {
  const db = await freshDb();
  const m = { milkman_code: 1, milkman_name: 'Other', milk_type: 'Cow' };
  await assert.rejects(repo.saveMilkman(db, m, { isNew: true }), /already used/);
  await assert.rejects(repo.saveMilkman(db, { ...m, milkman_code: 5, phone: 'abc' }, { isNew: true }), /phone/);
  await repo.saveMilkman(db, { ...m, milkman_code: 5 }, { isNew: true, photo: 'data:image/jpeg;base64,AAAA' });
  assert.equal(await repo.getPhoto(db, 5), 'data:image/jpeg;base64,AAAA');
  await repo.saveMilkman(db, { ...m, milkman_code: 5 }, {});
  assert.ok(await repo.getPhoto(db, 5), 'undefined photo keeps existing');
  await repo.saveMilkman(db, { ...m, milkman_code: 5 }, { photo: '' });
  assert.equal(await repo.getPhoto(db, 5), '');
  assert.equal((await repo.listMilkmen(db, { search: '%' })).length, 0, 'wildcards are literal');
});

test('purchase: rate formula, duplicate, edit keeps old rate, soft delete, audit', async () => {
  const db = await freshDb();
  const id = await repo.savePurchase(db, entry);
  let p = await repo.getPurchase(db, id);
  assert.equal(p.rate, round2(4.2 * 6 + 8.5 * 2));
  assert.equal(p.amount, round2(10.5 * p.rate));
  await assert.rejects(repo.savePurchase(db, entry), (e) => e.code === 'DUPLICATE');
  await repo.addRate(db, { applicable_date: '2026-02-01', milk_type: 'Cow', fat_rate: '10', snf_rate: '5' });
  await assert.rejects(repo.savePurchase(db, { ...entry, qty: '12' }, { id }), /reason/);
  await repo.savePurchase(db, { ...entry, qty: '12' }, { id, reason: 'qty typo' });
  assert.equal((await repo.getPurchase(db, id)).rate, p.rate);
  await repo.savePurchase(db, { ...entry, qty: '12', fat: '5' }, { id, reason: 'fat typo' });
  assert.equal((await repo.getPurchase(db, id)).rate, 92.5);
  await assert.rejects(repo.deletePurchase(db, id, ' '), /reason/);
  await repo.deletePurchase(db, id, 'wrong milkman');
  assert.equal((await repo.totalPurchases(db, {})).n, 0);
  assert.equal((await repo.getPurchase(db, id)).delete_reason, 'wrong milkman');
  assert.ok((await repo.listAudit(db)).some((a) => a.action === 'delete' && a.entity === 'purchase'));
});

test('rate methods and milkman fixed rate', async () => {
  const db = await freshDb();
  assert.equal(repo.calcRate({ method: 'fat', fat_rate: 7 }, 6, 9), 42);
  assert.equal(repo.calcRate({ method: 'fixed', fixed_rate: 55.5 }, 6, 9), 55.5);
  await repo.saveMilkman(db, { milkman_code: 2, milkman_name: 'Fixed', milk_type: 'Cow', custom_rate: '50' }, { isNew: true });
  const id = await repo.savePurchase(db, { ...entry, milkman_code: 2 });
  assert.equal((await repo.getPurchase(db, id)).amount, 525);
});

test('balances, reports and filters agree', async () => {
  const db = await freshDb();
  await repo.savePurchase(db, entry);                                             // Mar 1: 443.10
  await repo.savePurchase(db, { ...entry, date: '2026-04-02', shift: 'Evening' }); // Apr 2: 443.10
  await repo.addPayment(db, { milkman_code: 1, date: '2026-03-05', type: 'payment', amount: '400' });
  await repo.addPayment(db, { milkman_code: 1, date: '2026-04-03', type: 'advance', amount: '100' });
  await repo.addPayment(db, { milkman_code: 1, date: '2026-04-04', type: 'adjustment', amount: '-3.10', notes: 'short' });
  const [b] = await repo.balances(db, { from: '2026-04-01', to: '2026-04-30' });
  assert.deepEqual([b.opening, b.purchase, b.payment, b.advance, b.adjustment, b.closing], [43.1, 443.1, 0, 100, -3.1, 383.1]);
  const acct = await buildReport(db, 'account', { from: '2026-04-01', to: '2026-04-30' });
  assert.equal(acct.totals.closing, 383.1);
  assert.equal(acct.totals.purchase, (await buildReport(db, 'daily', { from: '2026-04-01', to: '2026-04-30' })).totals.amount);
  const morning = await buildReport(db, 'daily', { shift: 'Morning' });
  assert.equal(morning.totals.n, 1);
  for (const type of ['daily', 'account', 'rate', 'entries', 'ledger', 'pending']) {
    const r = await buildReport(db, type, { from: '2026-01-01', to: '2026-12-31', milkman: 1 });
    assert.ok(r.rows.length > 0, type);
    assert.ok(reportMatrix(r, { businessName: 'B', filters: ['f'], generated: 'g' }).rows.length > 5);
  }
});

test('CSV parse/write', () => {
  assert.deepEqual(parseCSV('﻿a;b\r\n"1;x";"he said ""hi"""\r\n'), [['a', 'b'], ['1;x', 'he said "hi"']]);
  assert.deepEqual(parseCSV('a,b\n"line1\nline2",2'), [['a', 'b'], ['line1\nline2', '2']]);
  assert.ok(toCSV([['=cmd()', -5, '-5']]).includes("'=cmd(),-5,-5"));
  assert.equal(decodeText(new TextEncoder().encode('दूध 🥛 ₹')), 'दूध 🥛 ₹');
  assert.throws(() => decodeText(Uint8Array.from([0xe9, 0x20])), /UTF-8/);
});

test('XLSX round trip and openpyxl fixture (shared strings, date cells)', async () => {
  const bytes = await writeXlsx(JSZip, [{ name: 'A/B', rows: [['Name', 'Qty'], ['दूध & <x>', 10.5], ['', 3]] }]);
  const book = await openXlsx(JSZip, bytes);
  assert.deepEqual(book.sheetNames, ['A B']);
  assert.deepEqual(await book.rows('A B'), [['Name', 'Qty'], ['दूध & <x>', '10.5'], ['', '3']]);
  const fx = await openXlsx(JSZip, readFileSync(new URL('./fixture.xlsx', import.meta.url)));
  assert.deepEqual(fx.sheetNames, ['Entries', 'Other']);
  const rows = await fx.rows('Entries');
  assert.deepEqual(rows[1], ['2026-04-01', 'Morning', '1', '10.5', '4.2', '8.5']);
  assert.deepEqual(rows[3], ['2026-04-03', 'Evening', '1', '8', '4', '8']);
  await assert.rejects(openXlsx(JSZip, Buffer.from('not a zip')), /valid/);
});

test('import: map, validate, duplicates, commit, summary', async () => {
  const db = await freshDb();
  await repo.savePurchase(db, entry);
  const [head, ...rows] = parseCSV(`Date,Shift,Code,Quantity,Fat,SNF,Amount
01-03-2026,Morning,1,10.5,4.2,8.5,
02-03-2026,Morning,1,"1,200",4,8,
02-03-2026,Morning,1,5,4,8,
03-03-2026,Night,1,5,4,8,
31-02-2026,Morning,1,5,4,8,
03-03-2026,Evening,77,5,4,8,
03-03-2026,Evening,1,5,4,8,999`);
  const map = imp.autoMap('purchases', head);
  assert.equal(map.milkman_code, 2);
  const plan = await imp.validateImport(db, 'purchases', rows, map, { dateFormat: 'DD-MM-YYYY', decimal: '.', duplicates: 'skip' });
  assert.equal(plan.valid.length, 1);   // 1,200 litres
  assert.equal(plan.skipped.length, 2); // already exists + duplicate inside file
  assert.equal(plan.failed.length, 4);
  assert.equal((await repo.totalPurchases(db, {})).n, 1, 'validate does not write');
  assert.deepEqual(await imp.commitImport(db, plan, 'u'), { added: 1, updated: 0, skipped: 2, failed: 4 });
  assert.equal((await repo.totalPurchases(db, {})).qty, 1210.5);
});

test('import: update existing milkman keeps unmapped fields; rates import', async () => {
  const db = await freshDb();
  await repo.saveMilkman(db, { milkman_code: 1, milkman_name: 'Ramesh', milk_type: 'Cow', phone: '9876543210' }, {});
  const plan = await imp.validateImport(db, 'milkmen', [['1', 'Ramesh K', 'cow']], { milkman_code: 0, milkman_name: 1, milk_type: 2 }, { duplicates: 'update', decimal: '.' });
  await imp.commitImport(db, plan, 'u');
  const m = await repo.getMilkman(db, 1);
  assert.deepEqual([m.milkman_name, m.phone, m.milk_type], ['Ramesh K', '9876543210', 'Cow']);
  for (const type of Object.keys(imp.IMPORT_TYPES)) {
    const [h, ...r] = imp.templateRows(type);
    const d = await freshDb();
    if (type === 'purchases') {
      await repo.saveMilkman(d, { milkman_code: 101, milkman_name: 'A', milk_type: 'Cow' }, { isNew: true });
      await repo.saveMilkman(d, { milkman_code: 102, milkman_name: 'B', milk_type: 'Cow' }, { isNew: true });
      await repo.addRate(d, { applicable_date: '2026-01-01', milk_type: 'Buffalo', fat_rate: 7, snf_rate: 2 });
    }
    const p = await imp.validateImport(d, type, r, imp.autoMap(type, h), { dateFormat: 'YYYY-MM-DD', decimal: '.' });
    assert.deepEqual(p.failed, [], type);
    assert.equal(p.valid.length, 2, type);
  }
});

test('backup/restore is atomic and keeps a snapshot', async () => {
  const db = await freshDb();
  await repo.savePurchase(db, entry);
  await repo.createFirstUser(db, 'owner', 'longpassword', rand);
  const backup = parseBackup(JSON.stringify(await createBackup(db)));
  assert.ok(!('tbl_User' in backup.tables));
  await repo.savePurchase(db, { ...entry, shift: 'Evening' });
  const broken = structuredClone(backup);
  broken.tables.Purchase.push({ ...broken.tables.Purchase[0] }); // duplicate primary key
  await assert.rejects(restoreBackup(db, broken, 'u'));
  assert.equal((await repo.totalPurchases(db, {})).n, 2, 'unchanged after failed restore');
  await restoreBackup(db, backup, 'u');
  assert.equal((await repo.totalPurchases(db, {})).n, 1);
  assert.equal((await getSnapshot(db)).tables.Purchase.length, 2);
  assert.ok(await repo.login(db, 'owner', 'longpassword'));
  assert.throws(() => parseBackup('{}'), /not a Milko/);
});
