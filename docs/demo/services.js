import { db } from './db.js';
import { hashPassword, verifyPassword, checkLoginRate, registerLoginFailure, clearLoginFailures } from './auth.js';
import { HttpError } from './http.js';
import { localStamp, addDays, today, str } from './util.js';

export const TENANT_ROLES = ['owner', 'manager', 'cashier'];
export const PAYMENT_METHODS = ['dinheiro', 'pix', 'debito', 'credito', 'outro'];
export const DISCOUNT_APPROVER_ROLES = ['owner', 'manager'];
/** Desconto máximo que um operador de caixa pode conceder sozinho (% do subtotal). */
export const CASHIER_DISCOUNT_LIMIT_PCT = 10;

const brl = (cents) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

/**
 * Valida o desconto conforme a função de quem vende.
 * Caixa: até CASHIER_DISCOUNT_LIMIT_PCT% do subtotal; acima disso exige e-mail e senha de um gerente
 * ou do dono da MESMA adega. Gerente/dono: sem limite, registrados como autorizadores do próprio desconto.
 * @returns {number|null} id do usuário que autorizou o desconto acima do limite (null se não precisou).
 */
export function authorizeDiscount({ tenant, user, subtotal, discount, authorization }) {
  const limit = Math.floor((subtotal * CASHIER_DISCOUNT_LIMIT_PCT) / 100);
  if (discount <= limit) return null;
  if (DISCOUNT_APPROVER_ROLES.includes(user.role)) return user.id;

  const email = str(authorization?.email, 160).toLowerCase();
  const password = typeof authorization?.password === 'string' ? authorization.password : '';
  if (!email || !password) {
    throw new HttpError(
      403,
      `Desconto acima de ${CASHIER_DISCOUNT_LIMIT_PCT}% (máximo ${brl(limit)} nesta venda). Peça a um gerente ou ao dono para autorizar.`,
      'DISCOUNT_AUTH_REQUIRED'
    );
  }
  const key = `discount|${tenant.id}|${email}`;
  if (!checkLoginRate(key)) throw new HttpError(429, 'Muitas tentativas de autorização. Aguarde alguns minutos.');
  const approver = db
    .prepare(
      `SELECT * FROM users WHERE email = ? AND tenant_id = ? AND active = 1
       AND role IN (${DISCOUNT_APPROVER_ROLES.map(() => '?').join(', ')})`
    )
    .get(email, tenant.id, ...DISCOUNT_APPROVER_ROLES);
  if (!approver || !verifyPassword(password, approver.password_hash)) {
    registerLoginFailure(key);
    throw new HttpError(
      403,
      'Autorização recusada: e-mail ou senha incorretos, ou o usuário não é gerente/dono desta adega.',
      'DISCOUNT_AUTH_INVALID'
    );
  }
  clearLoginFailures(key);
  return approver.id;
}

export function getPlan(id) {
  const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  return p ? publicPlan(p) : null;
}

export function publicPlan(p) {
  let features = [];
  try {
    features = JSON.parse(p.features);
  } catch {}
  return { ...p, features, highlighted: !!p.highlighted, active: !!p.active };
}

export function subscriptionState(t) {
  if (t.status === 'suspended') return { ok: false, reason: 'Assinatura suspensa. Entre em contato com a Kzann Tech.' };
  if (t.status === 'cancelled') return { ok: false, reason: 'Assinatura cancelada.' };
  if (t.status === 'trial' && t.trial_ends_at && t.trial_ends_at < today()) {
    return { ok: false, reason: 'O período de teste terminou. Escolha um plano para continuar.' };
  }
  return { ok: true, reason: '' };
}

export function publicTenant(t) {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    legal_name: t.legal_name,
    cnpj: t.cnpj,
    phone: t.phone,
    email: t.email,
    address: t.address,
    city: t.city,
    logo: t.logo,
    primary_color: t.primary_color,
    doc_footer: t.doc_footer,
    allow_negative_stock: !!t.allow_negative_stock,
    status: t.status,
    trial_ends_at: t.trial_ends_at,
    created_at: t.created_at,
    plan: t.plan_id ? getPlan(t.plan_id) : null,
    subscription: subscriptionState(t),
  };
}

export const publicUser = (u) => ({
  id: u.id,
  tenant_id: u.tenant_id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: !!u.active,
  created_at: u.created_at,
});

export function assertEmailFree(email, exceptId = 0) {
  const row = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').get(email, exceptId);
  if (row) throw new HttpError(409, 'Este e-mail já está em uso.');
}

/** Cria uma adega (tenant) com seu usuário proprietário. Deve rodar dentro de tx(). */
export function createTenantWithOwner({ tenantName, ownerName, email, password, planId, status = 'trial', trialDays = 14 }) {
  assertEmailFree(email);
  const now = localStamp();
  const trialEnds = status === 'trial' ? addDays(today(), trialDays) : null;
  const t = db
    .prepare('INSERT INTO tenants (name, email, plan_id, status, trial_ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tenantName, email, planId, status, trialEnds, now);
  const tenantId = Number(t.lastInsertRowid);
  db.prepare(
    "INSERT INTO users (tenant_id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'owner', ?)"
  ).run(tenantId, ownerName, email, hashPassword(password), now);
  for (const name of ['Cervejas', 'Vinhos', 'Destilados', 'Refrigerantes e Águas', 'Energéticos', 'Conveniência']) {
    db.prepare('INSERT INTO categories (tenant_id, name) VALUES (?, ?)').run(tenantId, name);
  }
  return tenantId;
}

/** Verifica limite do plano (0 = ilimitado). */
export function assertPlanLimit(tenant, kind) {
  const plan = tenant.plan_id ? getPlan(tenant.plan_id) : null;
  if (!plan) return;
  const max = kind === 'users' ? plan.max_users : plan.max_products;
  if (!max) return;
  const sql =
    kind === 'users'
      ? 'SELECT COUNT(*) n FROM users WHERE tenant_id = ? AND active = 1'
      : 'SELECT COUNT(*) n FROM products WHERE tenant_id = ? AND active = 1';
  const { n } = db.prepare(sql).get(tenant.id);
  if (n >= max) {
    const label = kind === 'users' ? 'usuários' : 'produtos';
    throw new HttpError(403, `Seu plano ${plan.name} permite até ${max} ${label}. Faça upgrade para adicionar mais.`);
  }
}
