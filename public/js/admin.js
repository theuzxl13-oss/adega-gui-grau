// Painel administrativo da Kzann Tech: adegas assinantes, planos e marca da plataforma.
import {
  api, session, logout, applyBrand, applyPrimary, icon, esc, initials, money, num, toast, openModal,
  formValues, withBusy, parseMoney, centsToInput, fmtDate, fmtDateTime, imageToDataUrl, tenantLogoHtml,
  STATUS_LABELS, DEMO_MODE, DEFAULT_BRAND,
} from './core.js';

if (!session.get()) location.replace('login.html');

const $ = (id) => document.getElementById(id);
const STATUS_BADGE = { trial: 'primary', active: 'success', suspended: 'danger', cancelled: 'danger' };
const statusBadge = (s) => `<span class="badge ${STATUS_BADGE[s]}">${STATUS_LABELS[s]}</span>`;
let user = null;

// ---------- Visão geral ----------
async function overview(el) {
  const o = await api('/api/admin/overview');
  el.innerHTML = `<div class="stack">
    <div class="grid grid-4">
      <div class="card kpi"><div class="label">Receita recorrente (MRR)</div><div class="value">${money(o.mrr)}</div><div class="delta">${num(o.by_status.active)} assinaturas ativas</div></div>
      <div class="card kpi"><div class="label">Adegas cadastradas</div><div class="value">${num(o.tenants)}</div><div class="delta">${num(o.by_status.trial)} em teste</div></div>
      <div class="card kpi"><div class="label">Usuários ativos</div><div class="value">${num(o.users)}</div><div class="delta">em todas as adegas</div></div>
      <div class="card kpi"><div class="label">Vendas na plataforma (30d)</div><div class="value">${num(o.sales_30d.n)}</div><div class="delta">${money(o.sales_30d.total)} transacionados</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><div class="card-head"><h3>Testes terminando em 7 dias</h3></div>
        <div class="table-wrap"><table class="table"><tbody>
        ${o.trials_ending.map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${fmtDate(t.trial_ends_at)}</td></tr>`).join('') || '<tr><td class="empty">Nenhum teste terminando.</td></tr>'}
        </tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>Cadastros recentes</h3><span class="spacer"></span><a href="#/adegas" class="small">Ver todas</a></div>
        <div class="table-wrap"><table class="table"><tbody>
        ${o.recent.map((t) => `<tr><td>${esc(t.name)}</td><td>${statusBadge(t.status)}</td><td class="num muted">${fmtDate(t.created_at)}</td></tr>`).join('')}
        </tbody></table></div></div>
    </div>
    <div class="card card-pad row wrap">
      <div><b>Situação das assinaturas</b><div class="small muted">Ativas, em teste, suspensas e canceladas</div></div><span class="spacer"></span>
      ${Object.entries(o.by_status).map(([k, v]) => `<span>${statusBadge(k)} <b>${num(v)}</b></span>`).join('')}
    </div></div>`;
}

// ---------- Adegas ----------
async function tenants(el, actions) {
  const [list, plans] = await Promise.all([api('/api/admin/tenants'), api('/api/admin/plans')]);
  actions.innerHTML = `<button class="btn btn-primary" id="t-new">${icon('plus')} Nova adega</button>`;
  const planOptions = (sel) => plans.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)} — ${money(p.price_cents)}</option>`).join('');
  const statusOptions = (sel) => Object.entries(STATUS_LABELS).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');

  el.innerHTML = `<div class="card">
    <div class="card-head"><input class="input" id="t-q" placeholder="Buscar adega, e-mail ou cidade" style="max-width:320px"><span class="spacer"></span><span class="muted small">${num(list.length)} adega(s)</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Adega</th><th>Plano</th><th>Status</th><th class="num">Usuários</th><th class="num">Produtos</th><th class="num">Vendas 30d</th><th>Última venda</th><th></th></tr></thead>
      <tbody id="t-body"></tbody></table></div></div>`;

  const draw = (q = '') => {
    const needle = q.toLowerCase();
    el.querySelector('#t-body').innerHTML = list
      .filter((t) => !needle || [t.name, t.email, t.city, t.owner_name].some((v) => (v || '').toLowerCase().includes(needle)))
      .map((t) => `<tr>
        <td><div class="row">${tenantLogoHtml(t, 34)}<div><b>${esc(t.name)}</b><div class="small muted">${esc(t.owner_name || '')} · ${esc(t.email)}</div></div></div></td>
        <td>${esc(t.plan_name || '—')}<div class="small muted">${money(t.plan_price)}/mês</div></td>
        <td>${statusBadge(t.status)}${t.status === 'trial' ? `<div class="small muted">até ${fmtDate(t.trial_ends_at)}</div>` : ''}</td>
        <td class="num">${num(t.user_count)}</td><td class="num">${num(t.product_count)}</td><td class="num">${num(t.sales_30d)}</td>
        <td>${fmtDateTime(t.last_sale_at)}</td>
        <td class="right"><button class="btn btn-sm" data-t="${t.id}">${icon('edit')} Gerenciar</button></td></tr>`)
      .join('') || '<tr><td colspan="8" class="empty">Nenhuma adega encontrada.</td></tr>';
  };
  draw();
  el.querySelector('#t-q').addEventListener('input', (e) => draw(e.target.value));

  el.addEventListener('click', (e) => {
    const id = e.target.closest('[data-t]')?.dataset.t;
    if (!id) return;
    const t = list.find((x) => x.id === Number(id));
    const m = openModal({
      title: `Assinatura — ${t.name}`,
      body: `<form id="tf" class="form-grid">
        <label class="field">Status<select class="input" name="status">${statusOptions(t.status)}</select></label>
        <label class="field">Plano<select class="input" name="plan_id">${planOptions(t.plan_id)}</select></label>
        <label class="field">Fim do período de teste<input class="input" type="date" name="trial_ends_at" value="${esc(t.trial_ends_at || '')}"></label>
        <div class="field"><span>Cliente desde</span><b style="font-weight:500">${fmtDate(t.created_at)}</b></div>
        <p class="full small muted">Suspender bloqueia o acesso da adega ao PDV e aos relatórios; os dados são mantidos.</p>
      </form>`,
      foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" form="tf">Salvar</button>`,
    });
    m.el.querySelector('#tf').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = formValues(ev.target);
      withBusy(ev.submitter, async () => {
        await api(`/api/admin/tenants/${t.id}`, { method: 'PUT', body: { ...v, plan_id: Number(v.plan_id) } });
        toast('Assinatura atualizada.', 'success');
        m.close();
        route();
      }).catch(() => {});
    });
  });

  actions.querySelector('#t-new').addEventListener('click', () => {
    const m = openModal({
      title: 'Nova adega',
      body: `<form id="nf" class="form-grid">
        <label class="field full">Nome da adega<input class="input" name="tenant_name" required maxlength="120"></label>
        <label class="field">Responsável<input class="input" name="name" required maxlength="120"></label>
        <label class="field">E-mail de acesso<input class="input" name="email" type="email" required></label>
        <label class="field">Senha inicial<span class="hint">Mínimo de 8 caracteres.</span><input class="input" name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        <label class="field">Plano<select class="input" name="plan_id">${planOptions(plans[0]?.id)}</select></label>
        <label class="field">Status<select class="input" name="status">${statusOptions('trial')}</select></label>
      </form>`,
      foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" form="nf">Criar adega</button>`,
    });
    m.el.querySelector('#nf').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = formValues(ev.target);
      withBusy(ev.submitter, async () => {
        await api('/api/admin/tenants', { method: 'POST', body: { ...v, plan_id: Number(v.plan_id) } });
        toast('Adega criada.', 'success');
        m.close();
        route();
      }).catch(() => {});
    });
  });
}

// ---------- Planos ----------
async function plans(el, actions) {
  const list = await api('/api/admin/plans');
  actions.innerHTML = `<button class="btn btn-primary" id="p-new">${icon('plus')} Novo plano</button>`;
  el.innerHTML = `<div class="grid grid-3">${list.map((p) => `<div class="card card-pad stack" style="${p.highlighted ? 'border:2px solid var(--kz-primary)' : ''}">
      <div class="row"><h3>${esc(p.name)}</h3>${p.active ? '' : '<span class="badge">Inativo</span>'}${p.highlighted ? '<span class="badge primary">Destaque</span>' : ''}</div>
      <div style="font-size:26px;font-weight:800">${money(p.price_cents)}<span class="muted" style="font-size:13px;font-weight:500"> /mês</span></div>
      <p class="muted">${esc(p.description)}</p>
      <ul style="margin:0;padding-left:18px">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <div class="small muted">${p.max_users || '∞'} usuários · ${p.max_products ? num(p.max_products) : '∞'} produtos · ${num(p.tenant_count)} adega(s)</div>
      <button class="btn btn-sm" data-p="${p.id}">${icon('edit')} Editar</button></div>`).join('')}</div>`;

  const modal = (p = null) => {
    const m = openModal({
      title: p ? `Editar plano ${p.name}` : 'Novo plano',
      body: `<form id="plf" class="form-grid">
        <label class="field">Nome<input class="input" name="name" required maxlength="60" value="${esc(p?.name || '')}"></label>
        <label class="field">Preço mensal (R$)<input class="input" name="price" inputmode="decimal" required value="${p ? centsToInput(p.price_cents) : ''}"></label>
        <label class="field full">Descrição<input class="input" name="description" maxlength="200" value="${esc(p?.description || '')}"></label>
        <label class="field">Máx. usuários<span class="hint">0 = ilimitado</span><input class="input" type="number" min="0" name="max_users" value="${p?.max_users ?? 2}"></label>
        <label class="field">Máx. produtos<span class="hint">0 = ilimitado</span><input class="input" type="number" min="0" name="max_products" value="${p?.max_products ?? 300}"></label>
        <label class="field full">Recursos (um por linha)<textarea class="input" name="features" rows="5">${esc((p?.features || []).join('\n'))}</textarea></label>
        <label class="field">Ordem<input class="input" type="number" min="0" name="sort" value="${p?.sort ?? 0}"></label>
        <div class="stack" style="gap:8px;justify-content:end">
          <label class="check"><input type="checkbox" name="highlighted" ${p?.highlighted ? 'checked' : ''}> Destacar na página comercial</label>
          <label class="check"><input type="checkbox" name="active" ${!p || p.active ? 'checked' : ''}> Disponível para contratação</label>
        </div>
      </form>`,
      foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" form="plf">Salvar</button>`,
    });
    m.el.querySelector('#plf').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = formValues(ev.target);
      const body = {
        ...v,
        price_cents: parseMoney(v.price),
        features: v.features.split('\n').map((s) => s.trim()).filter(Boolean),
        highlighted: !!v.highlighted,
        active: !!v.active,
      };
      withBusy(ev.submitter, async () => {
        await api(p ? `/api/admin/plans/${p.id}` : '/api/admin/plans', { method: p ? 'PUT' : 'POST', body });
        toast('Plano salvo.', 'success');
        m.close();
        route();
      }).catch(() => {});
    });
  };
  actions.querySelector('#p-new').addEventListener('click', () => modal());
  el.addEventListener('click', (e) => {
    const id = e.target.closest('[data-p]')?.dataset.p;
    if (id) modal(list.find((p) => p.id === Number(id)));
  });
}

// ---------- Marca Kzann Tech ----------
async function brandView(el) {
  const b = await api('/api/admin/brand');
  let logo = b.logoUrl;
  el.innerHTML = `<div class="grid grid-2-1" style="align-items:start">
    <form class="card" id="bf">
      <div class="card-head"><h3>Identidade da plataforma</h3></div>
      <div class="card-body form-grid">
        <div class="field full"><span>Logotipo (símbolo)</span><div class="logo-drop">
          <div class="logo-preview" id="b-logo"></div>
          <div class="stack" style="gap:8px">
            <label class="btn btn-sm">${icon('plus')} Enviar imagem<input type="file" id="b-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
            <button type="button" class="btn btn-sm btn-ghost" id="b-reset">Restaurar padrão</button>
          </div></div></div>
        <label class="field">Marca (fornecedora)<input class="input" name="vendorName" maxlength="160" value="${esc(b.vendorName)}"></label>
        <label class="field">Nome do sistema<input class="input" name="productName" maxlength="160" value="${esc(b.productName)}"></label>
        <label class="field full">Slogan<input class="input" name="slogan" maxlength="160" value="${esc(b.slogan)}"></label>
        <label class="field full">Público-alvo<input class="input" name="audience" maxlength="160" value="${esc(b.audience)}"></label>
        <div class="field full"><span>Cores</span><div class="row wrap">
          <label class="row small"><input type="color" class="swatch" name="primaryColor" value="${esc(b.primaryColor)}"> Primária</label>
          <label class="row small"><input type="color" class="swatch" name="accentColor" value="${esc(b.accentColor)}"> Destaque</label>
          <label class="row small"><input type="color" class="swatch" name="darkColor" value="${esc(b.darkColor)}"> Fundo escuro</label>
        </div></div>
        <label class="field">E-mail de suporte<input class="input" name="supportEmail" type="email" value="${esc(b.supportEmail)}"></label>
        <label class="field">WhatsApp de suporte<input class="input" name="supportWhatsapp" maxlength="40" value="${esc(b.supportWhatsapp)}"></label>
        <label class="field">Site<input class="input" name="website" maxlength="160" value="${esc(b.website)}"></label>
        <label class="field">Dias de teste grátis<input class="input" type="number" min="0" max="90" name="trialDays" value="${esc(b.trialDays)}"></label>
      </div>
      <div class="modal-foot" style="border-radius:0 0 var(--radius) var(--radius)"><button class="btn btn-primary">Salvar marca</button></div>
    </form>
    <div class="card"><div class="card-head"><h3>Pré-visualização</h3></div><div class="card-body" id="b-prev"></div></div>
  </div>`;
  const form = el.querySelector('#bf');
  const preview = () => {
    const v = formValues(form);
    el.querySelector('#b-logo').innerHTML = `<img src="${esc(logo)}" alt="">`;
    el.querySelector('#b-prev').innerHTML = `<div style="border-radius:12px;padding:20px;color:#fff;background:linear-gradient(150deg, ${esc(v.darkColor)} 40%, ${esc(v.primaryColor)})">
      <div class="row"><img src="${esc(logo)}" style="width:36px;height:36px;border-radius:9px" alt=""><b>${esc(v.productName)}</b></div>
      <div style="font-size:20px;font-weight:800;margin-top:28px">${esc(v.slogan)}</div>
      <div style="margin-top:14px"><span style="display:inline-block;padding:8px 14px;border-radius:8px;background:${esc(v.accentColor)};font-weight:700">Teste grátis</span></div></div>
      <p class="small muted" style="margin-top:12px">Aplicado na página comercial, login, painel das adegas, PDV, documentos e relatórios.</p>`;
  };
  form.addEventListener('input', preview);
  el.querySelector('#b-file').addEventListener('change', async (e) => {
    try {
      if (e.target.files[0]) logo = await imageToDataUrl(e.target.files[0]);
      preview();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  el.querySelector('#b-reset').addEventListener('click', () => ((logo = DEFAULT_BRAND.logoUrl), preview()));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formValues(form);
    withBusy(e.submitter, async () => {
      const saved = await api('/api/admin/brand', { method: 'PUT', body: { ...v, trialDays: Number(v.trialDays), logoUrl: logo } });
      applyBrand(saved);
      applyPrimary();
      toast('Marca da plataforma atualizada.', 'success');
    }).catch(() => {});
  });
  preview();
}

// ---------- Shell ----------
const ROUTES = {
  '/visao-geral': { title: 'Visão geral', icon: 'dashboard', view: overview },
  '/adegas': { title: 'Adegas assinantes', label: 'Adegas', icon: 'building', view: tenants },
  '/planos': { title: 'Planos', icon: 'layers', view: plans },
  '/marca': { title: 'Marca Kzann Tech', label: 'Marca', icon: 'palette', view: brandView },
};

async function route() {
  let path = location.hash.slice(1);
  if (!ROUTES[path]) {
    path = '/visao-geral';
    history.replaceState(null, '', `#${path}`);
  }
  const r = ROUTES[path];
  $('page-title').textContent = r.title;
  $('shell').classList.remove('nav-open');
  $('nav').innerHTML = Object.entries(ROUTES)
    .map(([p, x]) => `<a href="#${p}" class="${p === path ? 'active' : ''}">${icon(x.icon)}<span>${esc(x.label || x.title)}</span></a>`)
    .join('');
  const actions = $('topbar-actions');
  actions.innerHTML = '';
  const view = document.createElement('div');
  view.innerHTML = '<div class="empty">Carregando…</div>';
  $('view').replaceChildren(view);
  try {
    await r.view(view, actions);
  } catch (err) {
    view.innerHTML = `<div class="card card-pad empty">${esc(err.message)}</div>`;
  }
}

async function boot() {
  const me = await api('/api/auth/me');
  if (me.user.role !== 'superadmin') return location.replace('app.html');
  user = me.user;
  applyBrand(me.brand);
  applyPrimary();
  document.title = `Painel ${me.brand.vendorName}`;
  $('menu-toggle').innerHTML = icon('menu');
  $('menu-toggle').addEventListener('click', () => $('shell').classList.toggle('nav-open'));
  $('user-chip').innerHTML = `<div class="avatar">${esc(initials(user.name))}</div><div class="small"><b>${esc(user.name)}</b></div>
    <button class="btn btn-ghost icon-btn" id="logout" title="Sair" aria-label="Sair">${icon('logout')}</button>`;
  $('logout').addEventListener('click', logout);
  if (DEMO_MODE) $('sub-banner').innerHTML = `<div style="padding:16px 28px 0"><div class="banner warning">Versão de demonstração: os dados ficam salvos apenas neste navegador.</div></div>`;
  window.addEventListener('hashchange', route);
  route();
}

boot().catch((err) => ($('view').innerHTML = `<div class="card card-pad empty">${esc(err.message)}</div>`));
