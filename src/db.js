import * as SQLite from 'expo-sqlite';
import { migrate } from './core/migrations.js';
import * as repo from './core/repo.js';
import { randomBytes } from './platform/random';

export { today } from './core/dates.js';
export { round2 } from './core/money.js';
export { calcRate } from './core/repo.js';

let dbPromise;

/** Database file wahi purani 'milko.db' hai; schema src/core/migrations.js se upgrade hota hai. */
export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('milko.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await migrate(db, { randomBytes });
      return db;
    })().catch((e) => { dbPromise = null; throw e; });
  }
  return dbPromise;
}

export const findRate = async (date, milkType) => repo.findRate(await getDb(), date, milkType);
