// PDV (vendas), dashboard e relatórios.
import { db, tx } from '../db.js';
import { HttpError } from '../http.js';
import { PAYMENT_METHODS } from '../services.js';
import { str, int, localStamp, today, addDays, dateRange } from '../util.js';

const MANAGE = { auth: 'tenant', roles: ['owner', 'manager'] };

function getSale(tenantId, id) {
  const sale = db
    .prepare(
      `SELECT s.*, u.name AS user_name FROM sales s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.tenant_id = ?`
    )
    .get(id, tenantId);
  if (!sale) throw new HttpError(404, 'Venda não encontrada.');
  sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(sale.id);
  return sale;
}

function summary(tenantId, start, end) {
  const s = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS revenue, COALESCE(SUM(discount_cents), 0) AS discount
       FROM sales WHERE tenant_id = ? AND status = 'completed' AND created_at >= ? AND created_at < ?`
    )
    .get(tenantId, start, end);
  const { cost } = db
    .prepare(
      `SELECT COALESCE(SUM(i.cost_cents * i.qty), 0) AS cost FROM sale_items i JOIN sales s ON s.id = i.sale_id
       WHERE s.tenant_id = ? AND s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?`
    )
    .get(tenantId, start, end);
  return { ...s, cost, profit: s.revenue - cost, avg_ticket: s.count ? Math.round(s.revenue / s.count) : 0 };
}

function byDay(tenantId, from, to) {
  const rows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count, SUM(total_cents) AS revenue
       FROM sales WHERE tenant_id = ? AND status = 'completed' AND created_at >= ? AND created_at < ?
       GROUP BY day ORDER BY day`
    )
    .all(tenantId, `${from} 00:00:00`, `${addDays(to, 1)} 00:00:00`);
  const map = new Map(rows.map((r) => [r.day, r]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(map.get(d) || { day: d, count: 0, revenue: 0 });
  return out;
}

const byPayment = (tenantId, start, end) =>
  db
    .prepare(
      `SELECT payment_method AS method, COUNT(*) AS count, SUM(total_cents) AS revenue
       FROM sales WHERE tenant_id = ? AND status = 'completed' AND created_at >= ? AND created_at < ?
       GROUP BY payment_method ORDER BY revenue DESC`
    )
    .all(tenantId, start, end);

const topProducts = (tenantId, start, end, limit) =>
  db
    .prepare(
      `SELECT i.product_id, i.name, SUM(i.qty) AS qty, SUM(i.total_cents) AS revenue,
              SUM(i.total_cents - i.cost_cents * i.qty) AS profit
       FROM sale_items i JOIN sales s ON s.id = i.sale_id
       WHERE s.tenant_id = ? AND s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?
       GROUP BY i.product_id, i.name ORDER BY revenue DESC LIMIT ?`
    )
    .all(tenantId, start, end, limit);

export function register(r) {
  r.post('/api/sales', { auth: 'tenant' }, ({ body, tenant, user }) => {
    const items = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
    if (!items.length) throw new HttpError(400, 'Adicione ao menos um item à venda.');
    const method = PAYMENT_METHODS.includes(body.payment_method) ? body.payment_method : null;
    if (!method) throw new HttpError(400, 'Forma de pagamento inválida.');

    const merged = new Map();
    for (const it of items) {
      const pid = int(it.product_id);
      const qty = int(it.qty, { min: 1, max: 9999 });
      if (!pid || !qty) throw new HttpError(400, 'Item inválido.');
      merged.set(pid, (merged.get(pid) || 0) + qty);
    }

    const saleId = tx(() => {
      let subtotal = 0;
      const lines = [];
      for (const [pid, qty] of merged) {
        const p = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ? AND active = 1').get(pid, tenant.id);
        if (!p) throw new HttpError(400, 'Produto não encontrado ou inativo.');
        if (!tenant.allow_negative_stock && p.stock < qty) {
          throw new HttpError(400, `Estoque insuficiente para "${p.name}" (disponível: ${p.stock}).`);
        }
        const total = p.price_cents * qty;
        subtotal += total;
        lines.push({ p, qty, total });
      }
      const discount = int(body.discount_cents, { min: 0, max: subtotal, def: 0 });
      const total = subtotal - discount;
      let paid = total;
      let change = 0;
      if (method === 'dinheiro') {
        paid = int(body.amount_paid_cents, { min: 0, def: total });
        if (paid < total) throw new HttpError(400, 'Valor recebido é menor que o total da venda.');
        change = paid - total;
      }
      const now = localStamp();
      const { next } = db
        .prepare('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM sales WHERE tenant_id = ?')
        .get(tenant.id);
      const res = db
        .prepare(
          `INSERT INTO sales (tenant_id, number, user_id, customer_name, subtotal_cents, discount_cents, total_cents,
             payment_method, amount_paid_cents, change_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(tenant.id, next, user.id, str(body.customer_name, 120), subtotal, discount, total, method, paid, change, now);
      const id = Number(res.lastInsertRowid);
      for (const { p, qty, total: lineTotal } of lines) {
        db.prepare(
          `INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price_cents, cost_cents, total_cents)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, p.id, p.name, qty, p.price_cents, p.cost_cents, lineTotal);
        const balance = p.stock - qty;
        db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(balance, p.id);
        db.prepare(
          `INSERT INTO stock_movements (tenant_id, product_id, type, qty, balance, reason, user_id, sale_id, created_at)
           VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?)`
        ).run(tenant.id, p.id, -qty, balance, `Venda nº ${next}`, user.id, id, now);
      }
      return id;
    });
    return getSale(tenant.id, saleId);
  });

  r.get('/api/sales', { auth: 'tenant' }, ({ tenant, user, query }) => {
    const { start, end } = dateRange(query.from, query.to);
    const where = ['s.tenant_id = ?', 's.created_at >= ?', 's.created_at < ?'];
    const args = [tenant.id, start, end];
    // Operadores de caixa veem apenas as próprias vendas.
    if (user.role === 'cashier') {
      where.push('s.user_id = ?');
      args.push(user.id);
    }
    if (query.status === 'completed' || query.status === 'cancelled') {
      where.push('s.status = ?');
      args.push(query.status);
    }
    return db
      .prepare(
        `SELECT s.*, u.name AS user_name, (SELECT SUM(qty) FROM sale_items WHERE sale_id = s.id) AS item_count
         FROM sales s LEFT JOIN users u ON u.id = s.user_id
         WHERE ${where.join(' AND ')} ORDER BY s.id DESC LIMIT 2000`
      )
      .all(...args);
  });

  r.get('/api/sales/:id', { auth: 'tenant' }, ({ tenant, user, params }) => {
    const sale = getSale(tenant.id, int(params.id));
    if (user.role === 'cashier' && sale.user_id !== user.id) throw new HttpError(404, 'Venda não encontrada.');
    return sale;
  });

  r.post('/api/sales/:id/cancel', MANAGE, ({ body, tenant, user, params }) => {
    const id = tx(() => {
      const sale = getSale(tenant.id, int(params.id));
      if (sale.status !== 'completed') throw new HttpError(400, 'Esta venda já foi cancelada.');
      const now = localStamp();
      db.prepare("UPDATE sales SET status = 'cancelled', cancel_reason = ? WHERE id = ?").run(
        str(body.reason, 160) || 'Cancelada',
        sale.id
      );
      for (const it of sale.items) {
        const p = it.product_id && db.prepare('SELECT * FROM products WHERE id = ?').get(it.product_id);
        if (!p) continue;
        const balance = p.stock + it.qty;
        db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(balance, p.id);
        db.prepare(
          `INSERT INTO stock_movements (tenant_id, product_id, type, qty, balance, reason, user_id, sale_id, created_at)
           VALUES (?, ?, 'cancel', ?, ?, ?, ?, ?, ?)`
        ).run(tenant.id, p.id, it.qty, balance, `Cancelamento da venda nº ${sale.number}`, user.id, sale.id, now);
      }
      return sale.id;
    });
    return getSale(tenant.id, id);
  });

  r.get('/api/dashboard', MANAGE, ({ tenant }) => {
    const d = today();
    const monthStart = `${d.slice(0, 8)}01`;
    const from14 = addDays(d, -13);
    return {
      today: summary(tenant.id, `${d} 00:00:00`, `${addDays(d, 1)} 00:00:00`),
      yesterday: summary(tenant.id, `${addDays(d, -1)} 00:00:00`, `${d} 00:00:00`),
      month: summary(tenant.id, `${monthStart} 00:00:00`, `${addDays(d, 1)} 00:00:00`),
      series: byDay(tenant.id, from14, d),
      payments: byPayment(tenant.id, `${monthStart} 00:00:00`, `${addDays(d, 1)} 00:00:00`),
      top: topProducts(tenant.id, `${monthStart} 00:00:00`, `${addDays(d, 1)} 00:00:00`, 5),
      low_stock: db
        .prepare(
          `SELECT id, name, stock, min_stock, unit FROM products
           WHERE tenant_id = ? AND active = 1 AND stock <= min_stock ORDER BY stock - min_stock LIMIT 8`
        )
        .all(tenant.id),
      product_count: db.prepare('SELECT COUNT(*) n FROM products WHERE tenant_id = ? AND active = 1').get(tenant.id).n,
    };
  });

  r.get('/api/reports/sales', MANAGE, ({ tenant, query }) => {
    const { from, to, start, end } = dateRange(query.from, query.to);
    if (from > to) throw new HttpError(400, 'Período inválido.');
    if (addDays(from, 366) < to) throw new HttpError(400, 'O período máximo é de 1 ano.');
    return {
      from,
      to,
      summary: summary(tenant.id, start, end),
      cancelled: db
        .prepare(
          `SELECT COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS total FROM sales
           WHERE tenant_id = ? AND status = 'cancelled' AND created_at >= ? AND created_at < ?`
        )
        .get(tenant.id, start, end),
      by_day: byDay(tenant.id, from, to),
      by_payment: byPayment(tenant.id, start, end),
      top_products: topProducts(tenant.id, start, end, 20),
      by_category: db
        .prepare(
          `SELECT COALESCE(c.name, 'Sem categoria') AS category, SUM(i.qty) AS qty, SUM(i.total_cents) AS revenue
           FROM sale_items i JOIN sales s ON s.id = i.sale_id
           LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id
           WHERE s.tenant_id = ? AND s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?
           GROUP BY category ORDER BY revenue DESC`
        )
        .all(tenant.id, start, end),
      by_user: db
        .prepare(
          `SELECT COALESCE(u.name, '—') AS user, COUNT(*) AS count, SUM(s.total_cents) AS revenue
           FROM sales s LEFT JOIN users u ON u.id = s.user_id
           WHERE s.tenant_id = ? AND s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?
           GROUP BY s.user_id ORDER BY revenue DESC`
        )
        .all(tenant.id, start, end),
    };
  });

  r.get('/api/reports/stock', MANAGE, ({ tenant }) => {
    const items = db
      .prepare(
        `SELECT p.id, p.name, p.sku, p.unit, p.stock, p.min_stock, p.cost_cents, p.price_cents,
                COALESCE(c.name, 'Sem categoria') AS category
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.tenant_id = ? AND p.active = 1 ORDER BY category, p.name`
      )
      .all(tenant.id);
    const totals = items.reduce(
      (t, p) => {
        const qty = Math.max(p.stock, 0);
        t.units += qty;
        t.cost += qty * p.cost_cents;
        t.retail += qty * p.price_cents;
        if (p.stock <= p.min_stock) t.low++;
        return t;
      },
      { units: 0, cost: 0, retail: 0, low: 0 }
    );
    return { generated_at: localStamp(), items, totals };
  });
}
