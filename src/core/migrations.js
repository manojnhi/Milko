// Versioned migrations (PRAGMA user_version). Sirf additive: koi table/column drop ya rename nahi hota.
// Har step apni transaction me chalta hai; fail hua to poora rollback aur data jaisa tha waisa hi.
import { hashPassword } from './auth.js';
import { write } from './tx.js';

export const SCHEMA_VERSION = 2;

// Purane app (v1.0.0) ka schema, bilkul waisa hi.
export const LEGACY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS tbl_User (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    user_type TEXT NOT NULL DEFAULT 'User'
  );
  CREATE TABLE IF NOT EXISTS Milkman_tbl (
    milkman_code INTEGER PRIMARY KEY,
    milkman_name TEXT NOT NULL,
    milk_type TEXT NOT NULL DEFAULT 'Cow',
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS Rate_tbl (
    rate_id INTEGER PRIMARY KEY AUTOINCREMENT,
    applicable_date TEXT NOT NULL,
    milk_type TEXT NOT NULL,
    fat_rate REAL NOT NULL,
    snf_rate REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS Purchase (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    shift TEXT NOT NULL,
    milkman_code INTEGER NOT NULL,
    qty REAL NOT NULL,
    fat REAL NOT NULL,
    snf REAL NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL,
    remark TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_purchase_date ON Purchase(date);
`;

async function addColumn(db, table, name, ddl) {
  const cols = await db.getAllAsync(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === name)) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
}

const steps = {
  1: async (db) => { await db.execAsync(LEGACY_SCHEMA); },

  2: async (db, { randomBytes }) => {
    for (const [n, d] of [['phone', 'TEXT'], ['address', 'TEXT'], ['joining_date', 'TEXT'], ['custom_rate', 'REAL'], ['notes', 'TEXT']]) {
      await addColumn(db, 'Milkman_tbl', n, d);
    }
    await addColumn(db, 'Rate_tbl', 'method', "TEXT NOT NULL DEFAULT 'fat_snf'");
    await addColumn(db, 'Rate_tbl', 'fixed_rate', 'REAL');
    await addColumn(db, 'Rate_tbl', 'deleted_at', 'TEXT');
    for (const [n, d] of [['milk_type', 'TEXT'], ['created_at', 'TEXT'], ['updated_at', 'TEXT'], ['deleted_at', 'TEXT'], ['delete_reason', 'TEXT']]) {
      await addColumn(db, 'Purchase', n, d);
    }
    await addColumn(db, 'tbl_User', 'must_change', 'INTEGER NOT NULL DEFAULT 0');

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS Milk_type (name TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS Payment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        milkman_code INTEGER NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('payment','advance','adjustment')),
        amount REAL NOT NULL,
        mode TEXT, reference TEXT, notes TEXT,
        created_at TEXT, deleted_at TEXT, delete_reason TEXT
      );
      CREATE TABLE IF NOT EXISTS Photo (milkman_code INTEGER PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS Setting (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS Audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL, user TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT,
        before_json TEXT, after_json TEXT, reason TEXT
      );
      CREATE TABLE IF NOT EXISTS Backup_snapshot (seq INTEGER PRIMARY KEY, chunk TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_purchase_milkman ON Purchase(milkman_code, date);
      CREATE INDEX IF NOT EXISTS idx_payment_milkman ON Payment(milkman_code, date);
      INSERT OR IGNORE INTO Milk_type (name) VALUES ('Cow'), ('Buffalo');
      INSERT OR IGNORE INTO Milk_type (name) SELECT DISTINCT milk_type FROM Milkman_tbl WHERE milk_type <> '';
      INSERT OR IGNORE INTO Milk_type (name) SELECT DISTINCT milk_type FROM Rate_tbl WHERE milk_type <> '';
      -- Purani entries me milk type store nahi tha: milkman ke maujooda type se bharte hain.
      UPDATE Purchase SET milk_type = (SELECT m.milk_type FROM Milkman_tbl m WHERE m.milkman_code = Purchase.milkman_code)
        WHERE milk_type IS NULL;
    `);

    // Plain-text passwords -> hash. Password wahi rehta hai; 'admin' wale ko login ke baad badalna padega.
    const users = await db.getAllAsync('SELECT id, password FROM tbl_User');
    for (const u of users) {
      if (String(u.password).startsWith('pbkdf2$')) continue;
      await db.runAsync('UPDATE tbl_User SET password = ?, must_change = ? WHERE id = ?',
        [hashPassword(u.password, randomBytes), u.password === 'admin' ? 1 : 0, u.id]);
    }
  },
};

export async function migrate(db, opts) {
  const { user_version: current } = await db.getFirstAsync('PRAGMA user_version');
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database version ${current} is newer than this app (${SCHEMA_VERSION}). Please update Milko.`);
  }
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    await write(db, async () => {
      await steps[v](db, opts);
      await db.execAsync(`PRAGMA user_version = ${v}`);
    });
  }
}
