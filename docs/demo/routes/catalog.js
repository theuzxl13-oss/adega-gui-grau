// Categorias, produtos e movimentações de estoque.
import { db, tx } from '../db.js';
import { HttpError } from '../http.js';
import { assertPlanLimit } from '../services.js';
import { str, int, localStamp } from '../util.js';

const MANAGE = { auth: 'tenant', roles: ['owner', 'manager'] };

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

function getProduct(tenantId, id) {
  const p = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ? AND p.tenant_id = ?`).get(id, tenantId);
  if (!p) throw new HttpError(404, 'Produto não encontrado.');
  return p;
}

function categoryOf(tenantId, value) {
  const id = int(value);
  if (!id) return null;
  const c = db.prepare('SELECT id FROM categories WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  if (!c) throw new HttpError(400, 'Categoria inválida.');
  return c.id;
}

function productFields(tenantId, body, current = {}) {
  const name = str(body.name ?? current.name, 160);
  if (!name) throw new HttpError(400, 'Informe o nome do produto.');
  const price = int(body.price_cents ?? current.price_cents, { min: 0, max: 100_000_000 });
  if (price === null) throw new HttpError(400, 'Preço de venda inválido.');
  const barcode = str(body.barcode ?? current.barcode, 60);
  if (barcode) {
    const dup = db
      .prepare('SELECT id FROM products WHERE tenant_id = ? AND barcode = ? AND active = 1 AND id <> ?')
      .get(tenantId, barcode, current.id || 0);
    if (dup) throw new HttpError(409, 'Já existe um produto com este código de barras.');
  }
  return {
    name,
    category_id: categoryOf(tenantId, body.category_id ?? current.category_id),
    sku: str(body.sku ?? current.sku, 60),
    barcode,
    unit: str(body.unit ?? current.unit, 10).toUpperCase() || 'UN',
    cost_cents: int(body.cost_cents ?? current.cost_cents, { min: 0, max: 100_000_000, def: 0 }),
    price_cents: price,
    min_stock: int(body.min_stock ?? current.min_stock, { min: 0, max: 1_000_000, def: 0 }),
  };
}

export function register(r) {
  r.get('/api/categories', { auth: 'tenant' }, ({ tenant }) =>
    db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS product_count
         FROM categories c WHERE c.tenant_id = ? ORDER BY c.name`
      )
      .all(tenant.id)
  );

  r.post('/api/categories', MANAGE, ({ body, tenant }) => {
    const name = str(body.name, 80);
    if (!name) throw new HttpError(400, 'Informe o nome da categoria.');
    const res = db.prepare('INSERT INTO categories (tenant_id, name) VALUES (?, ?)').run(tenant.id, name);
    return { id: Number(res.lastInsertRowid), name };
  });

  r.delete('/api/categories/:id', MANAGE, ({ tenant, params }) => {
    db.prepare('DELETE FROM categories WHERE id = ? AND tenant_id = ?').run(int(params.id), tenant.id);
    return { ok: true };
  });

  r.get('/api/products', { auth: 'tenant' }, ({ tenant, query }) => {
    const where = ['p.tenant_id = ?'];
    const args = [tenant.id];
    if (query.inactive !== '1') where.push('p.active = 1');
    if (query.category) {
      where.push('p.category_id = ?');
      args.push(int(query.category));
    }
    if (query.low === '1') where.push('p.stock <= p.min_stock');
    if (query.q) {
      where.push('(p.name LIKE ? OR p.barcode = ? OR p.sku = ?)');
      args.push(`%${str(query.q, 80)}%`, str(query.q, 80), str(query.q, 80));
    }
    return db.prepare(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.name LIMIT 1000`).all(...args);
  });

  r.post('/api/products', MANAGE, ({ body, tenant, user }) => {
    assertPlanLimit(tenant, 'products');
    const f = productFields(tenant.id, body);
    const stock = int(body.stock, { min: 0, max: 1_000_000, def: 0 });
    return tx(() => {
      const now = localStamp();
      const res = db
        .prepare(
          `INSERT INTO products (tenant_id, category_id, name, sku, barcode, unit, cost_cents, price_cents, stock, min_stock, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(tenant.id, f.category_id, f.name, f.sku, f.barcode, f.unit, f.cost_cents, f.price_cents, stock, f.min_stock, now);
      const id = Number(res.lastInsertRowid);
      if (stock) {
        db.prepare(
          `INSERT INTO stock_movements (tenant_id, product_id, type, qty, balance, reason, user_id, created_at)
           VALUES (?, ?, 'initial', ?, ?, 'Estoque inicial', ?, ?)`
        ).run(tenant.id, id, stock, stock, user.id, now);
      }
      return getProduct(tenant.id, id);
    });
  });

  r.put('/api/products/:id', MANAGE, ({ body, tenant, params }) => {
    const current = getProduct(tenant.id, int(params.id));
    const f = productFields(tenant.id, body, current);
    db.prepare(
      `UPDATE products SET category_id = ?, name = ?, sku = ?, barcode = ?, unit = ?, cost_cents = ?, price_cents = ?, min_stock = ?
       WHERE id = ? AND tenant_id = ?`
    ).run(f.category_id, f.name, f.sku, f.barcode, f.unit, f.cost_cents, f.price_cents, f.min_stock, current.id, tenant.id);
    return getProduct(tenant.id, current.id);
  });

  r.delete('/api/products/:id', MANAGE, ({ tenant, params }) => {
    db.prepare('UPDATE products SET active = 0 WHERE id = ? AND tenant_id = ?').run(int(params.id), tenant.id);
    return { ok: true };
  });

  r.post('/api/products/:id/stock', MANAGE, ({ body, tenant, user, params }) => {
    const type = ['in', 'out', 'adjust'].includes(body.type) ? body.type : null;
    if (!type) throw new HttpError(400, 'Tipo de movimentação inválido.');
    const qty = int(body.qty, { min: 0, max: 1_000_000 });
    if (qty === null || (type !== 'adjust' && qty === 0)) throw new HttpError(400, 'Quantidade inválida.');
    const reason = str(body.reason, 160);
    return tx(() => {
      const p = getProduct(tenant.id, int(params.id));
      const balance = type === 'in' ? p.stock + qty : type === 'out' ? p.stock - qty : qty;
      if (balance < 0 && !tenant.allow_negative_stock) throw new HttpError(400, 'Estoque insuficiente para esta saída.');
      const delta = balance - p.stock;
      db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(balance, p.id);
      db.prepare(
        `INSERT INTO stock_movements (tenant_id, product_id, type, qty, balance, reason, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(tenant.id, p.id, type, delta, balance, reason, user.id, localStamp());
      return getProduct(tenant.id, p.id);
    });
  });

  r.get('/api/products/:id/movements', MANAGE, ({ tenant, params }) => {
    const p = getProduct(tenant.id, int(params.id));
    return db
      .prepare(
        `SELECT m.*, u.name AS user_name FROM stock_movements m LEFT JOIN users u ON u.id = m.user_id
         WHERE m.product_id = ? AND m.tenant_id = ? ORDER BY m.id DESC LIMIT 100`
      )
      .all(p.id, tenant.id);
  });
}
