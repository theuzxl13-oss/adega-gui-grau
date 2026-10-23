// Configurações da adega (identidade visual nos documentos e interface) e usuários.
import { db } from '../db.js';
import { HttpError } from '../http.js';
import { hashPassword } from '../auth.js';
import { publicTenant, publicUser, assertEmailFree, assertPlanLimit, TENANT_ROLES } from '../services.js';
import { str, int, isEmail, isHexColor, isImageDataUrl, localStamp } from '../util.js';

export function register(r) {
  r.get('/api/tenant', { auth: 'tenant', allowInactive: true }, ({ tenant }) => publicTenant(tenant));

  r.put('/api/tenant', { auth: 'tenant', roles: ['owner'], allowInactive: true }, ({ body, tenant }) => {
    const name = str(body.name, 120);
    if (!name) throw new HttpError(400, 'O nome da adega é obrigatório.');
    const email = str(body.email, 160);
    if (email && !isEmail(email)) throw new HttpError(400, 'E-mail inválido.');
    const color = str(body.primary_color, 7);
    if (color && !isHexColor(color)) throw new HttpError(400, 'Cor inválida.');

    let logo = tenant.logo;
    if ('logo' in body) {
      if (!body.logo) logo = '';
      else if (!isImageDataUrl(body.logo)) throw new HttpError(400, 'Logotipo inválido. Use PNG, JPG, WEBP ou SVG.');
      else if (body.logo.length > 700_000) throw new HttpError(400, 'Logotipo muito grande (máx. ~500 KB).');
      else logo = body.logo;
    }

    db.prepare(
      `UPDATE tenants SET name = ?, legal_name = ?, cnpj = ?, phone = ?, email = ?, address = ?, city = ?,
         logo = ?, primary_color = ?, doc_footer = ?, allow_negative_stock = ? WHERE id = ?`
    ).run(
      name,
      str(body.legal_name, 160),
      str(body.cnpj, 20),
      str(body.phone, 30),
      email,
      str(body.address, 200),
      str(body.city, 80),
      logo,
      color,
      str(body.doc_footer, 240),
      body.allow_negative_stock ? 1 : 0,
      tenant.id
    );
    return publicTenant(db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant.id));
  });

  r.get('/api/users', { auth: 'tenant', roles: ['owner', 'manager'] }, ({ tenant }) =>
    db.prepare('SELECT * FROM users WHERE tenant_id = ? ORDER BY active DESC, name').all(tenant.id).map(publicUser)
  );

  r.post('/api/users', { auth: 'tenant', roles: ['owner'] }, ({ body, tenant }) => {
    const name = str(body.name, 120);
    const email = str(body.email, 160).toLowerCase();
    const role = TENANT_ROLES.includes(body.role) ? body.role : 'cashier';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!name) throw new HttpError(400, 'Informe o nome.');
    if (!isEmail(email)) throw new HttpError(400, 'E-mail inválido.');
    if (password.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
    assertEmailFree(email);
    assertPlanLimit(tenant, 'users');
    const res = db
      .prepare('INSERT INTO users (tenant_id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tenant.id, name, email, hashPassword(password), role, localStamp());
    return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(res.lastInsertRowid));
  });

  r.put('/api/users/:id', { auth: 'tenant', roles: ['owner'] }, ({ body, tenant, user, params }) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').get(int(params.id), tenant.id);
    if (!target) throw new HttpError(404, 'Usuário não encontrado.');
    const name = str(body.name, 120) || target.name;
    const email = body.email ? str(body.email, 160).toLowerCase() : target.email;
    if (!isEmail(email)) throw new HttpError(400, 'E-mail inválido.');
    assertEmailFree(email, target.id);
    let role = TENANT_ROLES.includes(body.role) ? body.role : target.role;
    let active = 'active' in body ? (body.active ? 1 : 0) : target.active;
    if (target.id === user.id) {
      // O proprietário não pode se rebaixar nem se desativar.
      role = target.role;
      active = 1;
    }
    if (active && !target.active) assertPlanLimit(tenant, 'users');
    db.prepare('UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?').run(name, email, role, active, target.id);
    if (typeof body.password === 'string' && body.password) {
      if (body.password.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), target.id);
    }
    return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id));
  });
}
