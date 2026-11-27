// Saare writes ek queue se: do transactions kabhi overlap nahi hote.
const queues = new WeakMap();
export function write(db, task) {
  const prev = queues.get(db) || Promise.resolve();
  const run = prev.then(async () => {
    let result;
    await db.withTransactionAsync(async () => { result = await task(); });
    return result;
  });
  queues.set(db, run.catch(() => {}));
  return run;
}
