// Aplicação da adega: shell, navegação e estado da sessão.
import {
  api, session, logout, applyBrand, applyPrimary, icon, esc, initials, tenantLogoHtml,
  ROLE_LABELS, fmtDate, DEMO_MODE,
} from './core.js';
import * as dashboard from './views/dashboard.js';
import * as pdv from './views/pdv.js';
import * as products from './views/products.js';
import * as sales from './views/sales.js';
import * as reports from './views/reports.js';
import * as settings from './views/settings.js';

if (!session.get()) location.replace('login.html');

const ROUTES = {
  '/dashboard': { title: 'Painel', icon: 'dashboard', view: dashboard, roles: ['owner', 'manager'] },
  '/pdv': { title: 'PDV — Frente de caixa', label: 'PDV', icon: 'cart', view: pdv, roles: ['owner', 'manager', 'cashier'] },
  '/produtos': { title: 'Produtos e estoque', label: 'Produtos', icon: 'box', view: products, roles: ['owner', 'manager'] },
  '/vendas': { title: 'Vendas', icon: 'receipt', view: sales, roles: ['owner', 'manager', 'cashier'] },
  '/relatorios': { title: 'Relatórios', icon: 'chart', view: reports, roles: ['owner', 'manager'] },
  '/configuracoes': { title: 'Configurações', icon: 'settings', view: settings, roles: ['owner', 'manager', 'cashier'] },
};

/** Estado compartilhado com as telas. */
export const state = { user: null, tenant: null, brand: null };

const $ = (id) => document.getElementById(id);
let cleanup = null;

export function renderTenantChrome() {
  const { tenant, user, brand } = state;
  applyPrimary(tenant.primary_color);
  document.title = `${tenant.name} · ${brand.productName}`;
  $('tenant-head').innerHTML = `${tenantLogoHtml(tenant)}
    <div><div class="tenant-name">${esc(tenant.name)}</div><div class="tenant-sub">${esc(tenant.plan?.name ? `Plano ${tenant.plan.name}` : '')}</div></div>`;
  $('user-chip').innerHTML = `<div class="avatar">${esc(initials(user.name))}</div>
    <div class="small" style="line-height:1.25"><b>${esc(user.name)}</b><br><span class="muted">${esc(ROLE_LABELS[user.role])}</span></div>
    <button class="btn btn-ghost icon-btn" id="logout" title="Sair" aria-label="Sair">${icon('logout')}</button>`;
  $('logout').addEventListener('click', logout);

  const sub = tenant.subscription;
  let banner = '';
  if (!sub.ok) banner = `<div class="banner danger">${icon('alert')}<span>${esc(sub.reason)}</span></div>`;
  else if (tenant.status === 'trial') {
    banner = `<div class="banner info">Você está no período de teste do plano ${esc(tenant.plan?.name || '')} até ${fmtDate(tenant.trial_ends_at)}.</div>`;
  }
  if (DEMO_MODE) banner += `<div class="banner warning">Versão de demonstração: os dados ficam salvos apenas neste navegador.</div>`;
  $('sub-banner').innerHTML = banner ? `<div style="padding:16px 28px 0" class="stack">${banner}</div>` : '';
}

function renderNav() {
  const role = state.user.role;
  const current = location.hash.slice(1);
  $('nav').innerHTML = Object.entries(ROUTES)
    .filter(([, r]) => r.roles.includes(role))
    .map(([path, r]) => `<a href="#${path}" class="${current.startsWith(path) ? 'active' : ''}">${icon(r.icon)}<span>${esc(r.label || r.title)}</span></a>`)
    .join('');
}

async function route() {
  const role = state.user.role;
  let path = location.hash.slice(1) || '';
  if (!ROUTES[path] || !ROUTES[path].roles.includes(role)) {
    path = role === 'cashier' ? '/pdv' : '/dashboard';
    if (!state.tenant.subscription.ok) path = '/configuracoes';
    history.replaceState(null, '', `#${path}`);
  }
  const r = ROUTES[path];
  cleanup?.();
  cleanup = null;
  $('shell').classList.remove('nav-open');
  $('page-title').textContent = r.title;
  $('topbar-actions').innerHTML = '';
  renderNav();
  // Container novo a cada rota, para que os ouvintes de eventos da tela anterior sejam descartados.
  const view = document.createElement('div');
  $('view').replaceChildren(view);
  if (!state.tenant.subscription.ok && path !== '/configuracoes') {
    view.innerHTML = `<div class="card card-pad empty"><h3>Acesso bloqueado</h3><p class="muted" style="margin-top:8px">${esc(state.tenant.subscription.reason)}</p></div>`;
    return;
  }
  view.innerHTML = '<div class="empty">Carregando…</div>';
  try {
    cleanup = (await r.view.render(view, { state, actions: $('topbar-actions'), refreshChrome: renderTenantChrome })) || null;
  } catch (err) {
    view.innerHTML = `<div class="card card-pad empty">${esc(err.message)}</div>`;
  }
}

async function boot() {
  const me = await api('/api/auth/me');
  if (me.user.role === 'superadmin') return location.replace('admin.html');
  Object.assign(state, me, { brand: applyBrand(me.brand) });
  $('menu-toggle').innerHTML = icon('menu');
  $('menu-toggle').addEventListener('click', () => $('shell').classList.toggle('nav-open'));
  renderTenantChrome();
  window.addEventListener('hashchange', route);
  route();
}

boot().catch((err) => {
  $('view').innerHTML = `<div class="card card-pad empty">${esc(err.message)}</div>`;
});
