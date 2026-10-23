// Esquema do banco (compartilhado pelo servidor Node e pela demonstração no navegador).
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS platform_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price_cents  INTEGER NOT NULL DEFAULT 0,
  max_users    INTEGER NOT NULL DEFAULT 0,   -- 0 = ilimitado
  max_products INTEGER NOT NULL DEFAULT 0,   -- 0 = ilimitado
  features     TEXT NOT NULL DEFAULT '[]',
  highlighted  INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tenants (
  id                   INTEGER PRIMARY KEY,
  name                 TEXT NOT NULL,             -- nome fantasia exibido na interface
  legal_name           TEXT NOT NULL DEFAULT '',
  cnpj                 TEXT NOT NULL DEFAULT '',
  phone                TEXT NOT NULL DEFAULT '',
  email                TEXT NOT NULL DEFAULT '',
  address              TEXT NOT NULL DEFAULT '',
  city                 TEXT NOT NULL DEFAULT '',
  logo                 TEXT NOT NULL DEFAULT '',  -- data URL
  primary_color        TEXT NOT NULL DEFAULT '',
  doc_footer           TEXT NOT NULL DEFAULT '',
  allow_negative_stock INTEGER NOT NULL DEFAULT 0,
  plan_id              INTEGER REFERENCES plans(id),
  status               TEXT NOT NULL DEFAULT 'trial', -- trial | active | suspended | cancelled
  trial_ends_at        TEXT,
  created_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = equipe Kzann Tech
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,                 -- superadmin | owner | manager | cashier
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  sku         TEXT NOT NULL DEFAULT '',
  barcode     TEXT NOT NULL DEFAULT '',
  unit        TEXT NOT NULL DEFAULT 'UN',
  cost_cents  INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  min_stock   INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id, active);

CREATE TABLE IF NOT EXISTS sales (
  id                INTEGER PRIMARY KEY,
  tenant_id         INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number            INTEGER NOT NULL,
  user_id           INTEGER REFERENCES users(id),
  customer_name     TEXT NOT NULL DEFAULT '',
  subtotal_cents    INTEGER NOT NULL,
  discount_cents    INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL,
  payment_method    TEXT NOT NULL,
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  change_cents      INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'completed', -- completed | cancelled
  cancel_reason     TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL,
  UNIQUE (tenant_id, number)
);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_date ON sales(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id               INTEGER PRIMARY KEY,
  sale_id          INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id       INTEGER REFERENCES products(id),
  name             TEXT NOT NULL,
  qty              INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  cost_cents       INTEGER NOT NULL DEFAULT 0,
  total_cents      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id         INTEGER PRIMARY KEY,
  tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,  -- in | out | adjust | sale | cancel | initial
  qty        INTEGER NOT NULL,
  balance    INTEGER NOT NULL,
  reason     TEXT NOT NULL DEFAULT '',
  user_id    INTEGER,
  sale_id    INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id, created_at);
`;

// Colunas adicionadas depois da versão inicial. Só acrescentam colunas opcionais (NULL),
// sem tocar nos dados existentes. Para reverter: ALTER TABLE <tabela> DROP COLUMN <coluna>.
const COLUMN_ADDITIONS = [
  // BUS-01: quem autorizou um desconto acima do limite do caixa.
  ['sales', 'discount_authorized_by', 'INTEGER REFERENCES users(id)'],
];

/** Aplica as colunas que faltarem. `db` segue a interface prepare().all() / exec(). */
export function applyColumnAdditions(db) {
  for (const [table, column, type] of COLUMN_ADDITIONS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
