// Versão de navegador de server/db.js: SQLite em WebAssembly (sql.js), persistido no localStorage.
// Expõe a mesma interface usada pelas rotas: db.prepare(sql).get/all/run e db.exec.
import { SCHEMA, applyColumnAdditions } from './schema.js';

const SQLJS = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/';
export const STORAGE_KEY = 'kz_demo_db_v1';

await new Promise((resolve, reject) => {
  if (window.initSqlJs) return resolve();
  const s = document.createElement('script');
  s.src = `${SQLJS}sql-wasm.js`;
  s.onload = resolve;
  s.onerror = () => reject(new Error('Não foi possível carregar o banco de demonstração.'));
  document.head.appendChild(s);
});
const SQL = await window.initSqlJs({ locateFile: (f) => SQLJS + f });

function load() {
  try {
    const b64 = localStorage.getItem(STORAGE_KEY);
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

const raw = new SQL.Database(load() || undefined);
raw.exec('PRAGMA foreign_keys = ON;');
raw.exec(SCHEMA);

const norm = (args) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a));

function withStmt(sql, args, fn) {
  const st = raw.prepare(sql);
  try {
    st.bind(norm(args));
    return fn(st);
  } finally {
    st.free();
  }
}

export const db = {
  exec: (sql) => raw.exec(sql),
  prepare: (sql) => ({
    get: (...args) => withStmt(sql, args, (st) => (st.step() ? st.getAsObject() : undefined)),
    all: (...args) =>
      withStmt(sql, args, (st) => {
        const rows = [];
        while (st.step()) rows.push(st.getAsObject());
        return rows;
      }),
    run: (...args) => {
      withStmt(sql, args, (st) => st.step());
      const changes = raw.getRowsModified();
      const lastInsertRowid = raw.exec('SELECT last_insert_rowid()')[0].values[0][0];
      return { changes, lastInsertRowid };
    },
  }),
};

applyColumnAdditions(db);

export function tx(fn) {
  raw.exec('BEGIN');
  try {
    const result = fn();
    raw.exec('COMMIT');
    return result;
  } catch (err) {
    raw.exec('ROLLBACK');
    throw err;
  }
}

/** Grava o banco no localStorage (chamado após cada requisição que altera dados). */
export function persist() {
  const bytes = raw.export();
  raw.exec('PRAGMA foreign_keys = ON;');
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  try {
    localStorage.setItem(STORAGE_KEY, btoa(bin));
  } catch {
    console.warn('Não foi possível salvar os dados da demonstração neste navegador.');
  }
}
