// Despacho da API, independente de transporte: usado pelo servidor HTTP (Node)
// e pela versão de demonstração que roda no navegador (GitHub Pages).
import { db } from './db.js';
import { verifyToken } from './auth.js';
import { createRouter, HttpError } from './http.js';
import { subscriptionState } from './services.js';
import * as publicRoutes from './routes/public.js';
import * as tenantRoutes from './routes/tenant.js';
import * as catalogRoutes from './routes/catalog.js';
import * as salesRoutes from './routes/sales.js';
import * as adminRoutes from './routes/admin.js';

const router = createRouter();
for (const mod of [publicRoutes, tenantRoutes, catalogRoutes, salesRoutes, adminRoutes]) mod.register(router);

/** Valida o token e carrega usuário/adega conforme as opções da rota. */
function authenticate(ctx, opts, authorization) {
  if (!opts.auth) return;
  const payload = verifyToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  const user = payload && db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.uid);
  if (!user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  ctx.user = user;

  if (user.tenant_id) ctx.tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenant_id);
  if (opts.auth === 'admin' && user.role !== 'superadmin') throw new HttpError(403, 'Acesso restrito à equipe Kzann Tech.');
  if (opts.auth === 'tenant') {
    if (!ctx.tenant) throw new HttpError(403, 'Acesso restrito a usuários de uma adega.');
    const sub = subscriptionState(ctx.tenant);
    if (!sub.ok && !opts.allowInactive) throw new HttpError(402, sub.reason);
  }
  if (opts.roles && !opts.roles.includes(user.role)) throw new HttpError(403, 'Você não tem permissão para esta ação.');
}

/** @returns {Promise<{status: number, data: any}>} */
export async function dispatch({ method, pathname, query = {}, body = {}, authorization = '', req = null }) {
  const match = router.match(method, pathname);
  if (!match) return { status: 404, data: { error: 'Rota não encontrada.' } };
  const ctx = { req, params: match.params, query, body };
  try {
    authenticate(ctx, match.route.opts, authorization);
    const result = await match.route.handler(ctx);
    return { status: 200, data: result ?? { ok: true } };
  } catch (err) {
    if (err instanceof HttpError) {
      return { status: err.status, data: err.code ? { error: err.message, code: err.code } : { error: err.message } };
    }
    console.error(err);
    return { status: 500, data: { error: 'Erro interno. Tente novamente.' } };
  }
}
