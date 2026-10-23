// Rotas públicas (página comercial, cadastro) e autenticação.
import { db, tx } from '../db.js';
import { HttpError } from '../http.js';
import {
  hashPassword, verifyPassword, signToken,
  checkLoginRate, registerLoginFailure, clearLoginFailures,
} from '../auth.js';
import { getBrand } from '../brand.js';
import { publicPlan, publicTenant, publicUser, createTenantWithOwner } from '../services.js';
import { str, int, isEmail } from '../util.js';

export function register(r) {
  r.get('/api/public/brand', () => getBrand());

  r.get('/api/public/plans', () =>
    db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY sort, price_cents').all().map(publicPlan)
  );

  r.post('/api/public/signup', ({ body }) => {
    const tenantName = str(body.tenant_name, 120);
    const ownerName = str(body.name, 120);
    const email = str(body.email, 160).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const planId = int(body.plan_id);
    if (!tenantName) throw new HttpError(400, 'Informe o nome da sua adega.');
    if (!ownerName) throw new HttpError(400, 'Informe seu nome.');
    if (!isEmail(email)) throw new HttpError(400, 'E-mail inválido.');
    if (password.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
    const plan = planId
      ? db.prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(planId)
      : db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY sort, price_cents LIMIT 1').get();
    if (!plan) throw new HttpError(400, 'Plano inválido.');

    const brand = getBrand();
    const tenantId = tx(() =>
      createTenantWithOwner({ tenantName, ownerName, email, password, planId: plan.id, trialDays: brand.trialDays })
    );
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    return {
      token: signToken({ uid: user.id }),
      user: publicUser(user),
      tenant: publicTenant(tenant),
    };
  });

  r.post('/api/auth/login', ({ body, req }) => {
    const email = str(body.email, 160).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const key = `${email}|${req?.socket?.remoteAddress || ''}`;
    if (!checkLoginRate(key)) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      registerLoginFailure(key);
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    clearLoginFailures(key);
    const tenant = user.tenant_id ? db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenant_id) : null;
    return { token: signToken({ uid: user.id }), user: publicUser(user), tenant: publicTenant(tenant) };
  });

  r.get('/api/auth/me', { auth: 'any', allowInactive: true }, ({ user, tenant }) => ({
    user: publicUser(user),
    tenant: publicTenant(tenant),
    brand: getBrand(),
  }));

  r.post('/api/auth/password', { auth: 'any', allowInactive: true }, ({ body, user }) => {
    const current = typeof body.current === 'string' ? body.current : '';
    const next = typeof body.password === 'string' ? body.password : '';
    if (!verifyPassword(current, user.password_hash)) throw new HttpError(400, 'Senha atual incorreta.');
    if (next.length < 8) throw new HttpError(400, 'A nova senha deve ter pelo menos 8 caracteres.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
    return { ok: true };
  });
}
