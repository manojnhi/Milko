// expo-sqlite jaisa API, Node ke built-in SQLite par (sirf tests ke liye). Node 22.13+.
import { DatabaseSync } from 'node:sqlite';

export function openTestDb() {
  const raw = new DatabaseSync(':memory:');
  const plain = (r) => (r ? { ...r } : null);
  const db = {
    raw,
    async execAsync(sql) { raw.exec(sql); },
    async runAsync(sql, params = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync(sql, params = []) { return raw.prepare(sql).all(...params).map(plain); },
    async getFirstAsync(sql, params = []) { return plain(raw.prepare(sql).get(...params)); },
    async withTransactionAsync(task) {
      raw.exec('BEGIN');
      try { await task(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
  return db;
}
