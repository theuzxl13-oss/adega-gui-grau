// Painel administrativo Kzann Tech: adegas assinantes, planos e marca da plataforma.
import { db, tx } from '../db.js';
import { HttpError } from '../http.js';
import { getBrand, updateBrand } from '../brand.js';
import { publicPlan, publicTenant, createTenantWithOwner } from '../services.js';
import { str, int, isEmail, isDate, today, addDays } from '../util.js';

const ADMIN = { auth: 'admin' };
const STATUSES = ['trial', 'active', 'suspended', 'cancelled'];

function planFields(body) {
  const name = str(body.name, 60);
  if (!name) throw new HttpError(400, 'Informe o nome do plano.');
  const features = Array.isArray(body.features)
    ? body.features.map((f) => str(f, 120)).filter(Boolean).slice(0, 20)
    : [];
  return [
    name,
    str(body.description, 200),
    int(body.price_cents, { min: 0, max: 10_000_000, def: 0 }),
    int(body.max_users, { min: 0, max: 10_000, def: 0 }),
    int(body.max_products, { min: 0, max: 1_000_000, def: 0 }),
    JSON.stringify(features),
    body.highlighted ? 1 : 0,
    body.active === false ? 0 : 1,
    int(body.sort, { min: 0, max: 999, def: 0 }),
  ];
}

export function register(r) {
  r.get('/api/admin/overview', ADMIN, () => {
    const counts = Object.fromEntries(
      db.prepare('SELECT status, COUNT(*) n FROM tenants GROUP BY status').all().map((r) => [r.status, r.n])
    );
    const { mrr } = db
      .prepare(
        `SELECT COALESCE(SUM(p.price_cents), 0) AS mrr FROM tenants t JOIN plans p ON p.id = t.plan_id
         WHERE t.status = 'active'`
      )
      .get();
    const d = today();
    return {
      tenants: Object.values(counts).reduce((a, b) => a + b, 0),
      by_status: { trial: 0, active: 0, suspended: 0, cancelled: 0, ...counts },
      mrr,
      users: db.prepare('SELECT COUNT(*) n FROM users WHERE tenant_id IS NOT NULL AND active = 1').get().n,
      sales_30d: db
        .prepare("SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) total FROM sales WHERE status='completed' AND created_at >= ?")
        .get(`${addDays(d, -29)} 00:00:00`),
      trials_ending: db
        .prepare(
          `SELECT id, name, trial_ends_at FROM tenants WHERE status = 'trial' AND trial_ends_at BETWEEN ? AND ?
           ORDER BY trial_ends_at`
        )
        .all(d, addDays(d, 7)),
      recent: db.prepare('SELECT id, name, status, created_at FROM tenants ORDER BY id DESC LIMIT 6').all(),
    };
  });

  r.get('/api/admin/tenants', ADMIN, () => {
    const since = `${addDays(today(), -29)} 00:00:00`;
    return db
      .prepare(
        `SELECT t.id, t.name, t.email, t.cnpj, t.city, t.status, t.trial_ends_at, t.created_at, t.plan_id, t.logo,
                p.name AS plan_name, p.price_cents AS plan_price,
                (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.active = 1) AS user_count,
                (SELECT COUNT(*) FROM products x WHERE x.tenant_id = t.id AND x.active = 1) AS product_count,
                (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = t.id AND s.status = 'completed' AND s.created_at >= ?) AS sales_30d,
                (SELECT MAX(created_at) FROM sales s WHERE s.tenant_id = t.id) AS last_sale_at,
                (SELECT name FROM users u WHERE u.tenant_id = t.id AND u.role = 'owner' ORDER BY id LIMIT 1) AS owner_name
         FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id ORDER BY t.id DESC`
      )
      .all(since);
  });

  r.post('/api/admin/tenants', ADMIN, ({ body }) => {
    const tenantName = str(body.tenant_name, 120);
    const ownerName = str(body.name, 120);
    const email = str(body.email, 160).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const status = STATUSES.includes(body.status) ? body.status : 'trial';
    const plan = db.prepare('SELECT id FROM plans WHERE id = ?').get(int(body.plan_id));
    if (!tenantName || !ownerName) throw new HttpError(400, 'Informe o nome da adega e do responsável.');
    if (!isEmail(email)) throw new HttpError(400, 'E-mail inválido.');
    if (password.length < 8) throw new HttpError(400, 'A senha inicial deve ter pelo menos 8 caracteres.');
    if (!plan) throw new HttpError(400, 'Plano inválido.');
    const id = tx(() =>
      createTenantWithOwner({ tenantName, ownerName, email, password, planId: plan.id, status, trialDays: getBrand().trialDays })
    );
    return publicTenant(db.prepare('SELECT * FROM tenants WHERE id = ?').get(id));
  });

  r.put('/api/admin/tenants/:id', ADMIN, ({ body, params }) => {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(int(params.id));
    if (!t) throw new HttpError(404, 'Adega não encontrada.');
    const status = STATUSES.includes(body.status) ? body.status : t.status;
    const planId = body.plan_id ? db.prepare('SELECT id FROM plans WHERE id = ?').get(int(body.plan_id))?.id : t.plan_id;
    if (!planId) throw new HttpError(400, 'Plano inválido.');
    const trialEnds = 'trial_ends_at' in body ? (isDate(body.trial_ends_at) ? body.trial_ends_at : null) : t.trial_ends_at;
    db.prepare('UPDATE tenants SET status = ?, plan_id = ?, trial_ends_at = ? WHERE id = ?').run(status, planId, trialEnds, t.id);
    return publicTenant(db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id));
  });

  r.get('/api/admin/plans', ADMIN, () =>
    db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM tenants t WHERE t.plan_id = p.id) AS tenant_count
         FROM plans p ORDER BY p.sort, p.price_cents`
      )
      .all()
      .map(publicPlan)
  );

  r.post('/api/admin/plans', ADMIN, ({ body }) => {
    const res = db
      .prepare(
        `INSERT INTO plans (name, description, price_cents, max_users, max_products, features, highlighted, active, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...planFields(body));
    return publicPlan(db.prepare('SELECT * FROM plans WHERE id = ?').get(res.lastInsertRowid));
  });

  r.put('/api/admin/plans/:id', ADMIN, ({ body, params }) => {
    const id = int(params.id);
    if (!db.prepare('SELECT id FROM plans WHERE id = ?').get(id)) throw new HttpError(404, 'Plano não encontrado.');
    db.prepare(
      `UPDATE plans SET name = ?, description = ?, price_cents = ?, max_users = ?, max_products = ?, features = ?,
         highlighted = ?, active = ?, sort = ? WHERE id = ?`
    ).run(...planFields(body), id);
    return publicPlan(db.prepare('SELECT * FROM plans WHERE id = ?').get(id));
  });

  r.get('/api/admin/brand', ADMIN, () => getBrand());
  r.put('/api/admin/brand', ADMIN, ({ body }) => updateBrand(body));
}
