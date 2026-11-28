import { write } from './tx.js';
import { SCHEMA_VERSION } from './migrations.js';
import { audit } from './repo.js';
import { nowStamp } from './dates.js';

// Login users jaan-bujhkar backup me nahi: restore se password nahi badalta.
const TABLES = ['Milk_type', 'Milkman_tbl', 'Rate_tbl', 'Milkman_rate', 'Purchase', 'Payment', 'Photo', 'Setting', 'Audit_log'];
const REQUIRED = ['Milkman_tbl', 'Rate_tbl', 'Purchase'];
const CHUNK = 300000;

export async function createBackup(db) {
  const tables = {};
  for (const t of TABLES) tables[t] = await db.getAllAsync(`SELECT * FROM ${t}`);
  return { app: 'milko', format: 1, schema: SCHEMA_VERSION, createdAt: nowStamp(), tables };
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not a Milko backup (invalid JSON)'); }
  if (data?.app !== 'milko' || data.format !== 1 || !data.tables) throw new Error('This file is not a Milko backup');
  if (data.schema > SCHEMA_VERSION) throw new Error('Backup was made by a newer Milko version. Update the app first.');
  for (const t of REQUIRED) if (!Array.isArray(data.tables[t])) throw new Error(`Backup is incomplete: ${t} missing`);
  for (const t of TABLES) if (data.tables[t] && !Array.isArray(data.tables[t])) throw new Error(`Backup is damaged: ${t}`);
  return data;
}

async function replaceAll(db, data) {
  for (const t of TABLES) {
    // Column names sirf database se: file ke keys SQL me kabhi nahi jate.
    const cols = (await db.getAllAsync(`PRAGMA table_info(${t})`)).map((c) => c.name);
    await db.runAsync(`DELETE FROM ${t}`);
    for (const row of data.tables[t] || []) {
      const use = cols.filter((c) => row[c] !== undefined);
      if (!use.length) throw new Error(`Backup is damaged: empty row in ${t}`);
      await db.runAsync(`INSERT INTO ${t} (${use.join(',')}) VALUES (${use.map(() => '?').join(',')})`, use.map((c) => row[c]));
    }
  }
}

async function saveSnapshot(db, data) {
  const text = JSON.stringify(data);
  await db.runAsync('DELETE FROM Backup_snapshot');
  for (let i = 0, seq = 0; i < text.length; i += CHUNK, seq++) {
    await db.runAsync('INSERT INTO Backup_snapshot (seq, chunk) VALUES (?,?)', [seq, text.slice(i, i + CHUNK)]);
  }
}
export async function getSnapshot(db) {
  const parts = await db.getAllAsync('SELECT chunk FROM Backup_snapshot ORDER BY seq');
  return parts.length ? parseBackup(parts.map((p) => p.chunk).join('')) : null;
}

/** Atomic: pehle current data ka snapshot, phir replace. Koi bhi error = kuch nahi badla. */
export function restoreBackup(db, data, user) {
  return write(db, async () => {
    await saveSnapshot(db, await createBackup(db));
    await replaceAll(db, data);
    await audit(db, user, 'restore', 'backup', data.createdAt);
  });
}
export const counts = (data) => ({
  milkmen: data.tables.Milkman_tbl.length, purchases: data.tables.Purchase.length,
  payments: (data.tables.Payment || []).length, rates: data.tables.Rate_tbl.length,
});
