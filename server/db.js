import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DB_FILE } from './paths.js';
import { SCHEMA, applyColumnAdditions } from './schema.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(SCHEMA);
applyColumnAdditions(db);

/** Executa fn dentro de uma transação. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
