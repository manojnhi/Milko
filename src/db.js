import * as SQLite from 'expo-sqlite';

let dbPromise;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('milko.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
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
      `);
      const u = await db.getFirstAsync('SELECT COUNT(*) AS c FROM tbl_User');
      if (!u || u.c === 0) {
        await db.runAsync(
          "INSERT INTO tbl_User (username, password, user_type) VALUES ('admin','admin','Admin')"
        );
      }
      return db;
    })();
  }
  return dbPromise;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Latest rate whose applicable_date <= given date for that milk type. */
export async function findRate(date, milkType) {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT * FROM Rate_tbl WHERE milk_type = ? AND applicable_date <= ?
     ORDER BY applicable_date DESC, rate_id DESC LIMIT 1`,
    [milkType, date]
  );
}

/** Rate per litre = fat% * fat_rate + snf% * snf_rate */
export function calcRate(rateRow, fat, snf) {
  if (!rateRow) return 0;
  return round2(Number(fat) * rateRow.fat_rate + Number(snf) * rateRow.snf_rate);
}
