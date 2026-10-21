// Minimal D1 binding over node:sqlite so tests execute the real migration SQL
// (constraints, foreign keys, ON CONFLICT) instead of a hand-written fake.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';

// Every migration, in the order wrangler applies them (file name order), as on the deployed database.
const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);
export const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
const MIGRATIONS = MIGRATION_FILES.map(f => readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'));

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON'); // D1 enforces foreign keys by default
  for (const sql of MIGRATIONS) db.exec(sql);
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    first: async () => { const r = db.prepare(sql).get(...args); return r ? {...r} : null; },
    all: async () => ({results: db.prepare(sql).all(...args).map(r => ({...r}))}),
    run: async () => { const r = db.prepare(sql).run(...args); return {success: true, meta: {changes: Number(r.changes)}}; }
  });
  return {
    sqlite: db,
    prepare: sql => statement(sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}

export function rows(d1, table) {
  return d1.sqlite.prepare(`SELECT * FROM ${table}`).all().map(r => ({...r}));
}
