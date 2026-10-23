// Configurações da adega: identidade visual, usuários, conta e assinatura.
import {
  api, esc, icon, toast, openModal, formValues, withBusy, imageToDataUrl, tenantLogoHtml, money, num,
  fmtDate, ROLE_LABELS, STATUS_LABELS, brand,
} from '../core.js';

export async function render(el, { state, refreshChrome }) {
  const role = state.user.role;
  const tabs = [
    role === 'owner' && ['identity', 'Identidade da adega'],
    role !== 'cashier' && ['users', 'Usuários'],
    ['account', 'Minha conta'],
    ['plan', 'Assinatura'],
  ].filter(Boolean);
  let tab = tabs[0][0];

  el.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}</button>`).join('')}</div><div id="set-body"></div>`;
  const body = el.querySelector('#set-body');

  function identity() {
    const t = state.tenant;
    let logo = t.logo;
    body.innerHTML = `<div class="grid grid-2-1" style="align-items:start">
      <form class="card" id="idf">
        <div class="card-head"><h3>Identidade visual e dados para documentos</h3></div>
        <div class="card-body form-grid">
          <div class="field full"><span>Logotipo</span>
            <div class="logo-drop">
              <div class="logo-preview" id="logo-prev"></div>
              <div class="stack" style="gap:8px">
                <label class="btn btn-sm">${icon('plus')} Enviar imagem<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
                <button type="button" class="btn btn-sm btn-ghost" id="logo-rm">Remover</button>
                <span class="small muted">PNG, JPG, WEBP ou SVG. Aparece na interface, no cupom e nos relatórios.</span>
              </div>
            </div>
          </div>
          <label class="field">Nome fantasia<input class="input" name="name" required maxlength="120" value="${esc(t.name)}"></label>
          <label class="field">Razão social<input class="input" name="legal_name" maxlength="160" value="${esc(t.legal_name)}"></label>
          <label class="field">CNPJ<input class="input" name="cnpj" maxlength="20" value="${esc(t.cnpj)}" placeholder="00.000.000/0000-00"></label>
          <label class="field">Telefone / WhatsApp<input class="input" name="phone" maxlength="30" value="${esc(t.phone)}"></label>
          <label class="field">E-mail<input class="input" name="email" type="email" maxlength="160" value="${esc(t.email)}"></label>
          <label class="field">Cidade/UF<input class="input" name="city" maxlength="80" value="${esc(t.city)}"></label>
          <label class="field full">Endereço<input class="input" name="address" maxlength="200" value="${esc(t.address)}"></label>
          <label class="field full">Mensagem no rodapé dos documentos<textarea class="input" name="doc_footer" maxlength="240">${esc(t.doc_footer)}</textarea></label>
          <div class="field"><span>Cor principal da interface</span>
            <div class="row"><input type="color" class="swatch" name="primary_color" value="${esc(t.primary_color || brand().primaryColor)}">
            <button type="button" class="btn btn-sm btn-ghost" id="color-reset">Usar cor Kzann Tech</button></div></div>
          <label class="check full"><input type="checkbox" name="allow_negative_stock" ${t.allow_negative_stock ? 'checked' : ''}>
            <span>Permitir vender sem estoque<br><span class="small muted">O estoque pode ficar negativo. Útil enquanto você ainda está cadastrando as quantidades.</span></span></label>
        </div>
        <div class="modal-foot" style="border-radius:0 0 var(--radius) var(--radius)"><button class="btn btn-primary">Salvar alterações</button></div>
      </form>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Pré-visualização</h3></div>
          <div class="card-body stack">
            <div style="background:var(--kz-dark);border-radius:10px;padding:14px" id="prev-side"></div>
            <div style="border:1px dashed var(--border);border-radius:10px;padding:16px;text-align:center;font-size:12px" id="prev-doc"></div>
          </div></div>
        <p class="small muted">A marca <b>${esc(brand().productName)}</b> aparece discretamente como fornecedora do software no rodapé dos documentos e do menu.</p>
      </div>
    </div>`;
    const form = body.querySelector('#idf');
    let color = t.primary_color;

    const preview = () => {
      const v = formValues(form);
      const fake = { ...t, ...v, logo, primary_color: color };
      body.querySelector('#logo-prev').innerHTML = logo ? `<img src="${esc(logo)}" alt="">` : 'Sem logotipo';
      body.querySelector('#prev-side').innerHTML = `<div class="row" style="--primary:${esc(color || brand().primaryColor)}">${tenantLogoHtml(fake)}
        <div><div style="color:#fff;font-weight:700">${esc(v.name || 'Sua adega')}</div><div class="small" style="color:#8E8AB0">Menu do sistema</div></div></div>`;
      body.querySelector('#prev-doc').innerHTML = `${logo ? `<img src="${esc(logo)}" style="width:56px;height:56px;object-fit:contain" alt="">` : ''}
        <div style="font-weight:800;font-size:14px">${esc(v.name || 'Sua adega')}</div>
        <div class="muted">${[v.legal_name, v.cnpj && `CNPJ ${v.cnpj}`, v.address, v.city].filter(Boolean).map(esc).join('<br>')}</div>
        <hr style="border:0;border-top:1px dashed var(--border);margin:10px 0">
        <div>${esc(v.doc_footer || '')}</div>
        <div class="muted" style="margin-top:6px;font-size:10px">Sistema ${esc(brand().productName)}</div>`;
    };
    form.addEventListener('input', (e) => {
      if (e.target.name === 'primary_color') color = e.target.value;
      preview();
    });
    body.querySelector('#color-reset').addEventListener('click', () => {
      color = '';
      form.primary_color.value = brand().primaryColor;
      preview();
    });
    body.querySelector('#logo-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        logo = await imageToDataUrl(file);
        preview();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    body.querySelector('#logo-rm').addEventListener('click', () => ((logo = ''), preview()));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(form);
      withBusy(e.submitter, async () => {
        state.tenant = await api('/api/tenant', {
          method: 'PUT',
          body: { ...v, logo, primary_color: color, allow_negative_stock: !!v.allow_negative_stock },
        });
        refreshChrome();
        toast('Identidade da adega atualizada.', 'success');
      }).catch(() => {});
    });
    preview();
  }

  async function users() {
    const list = await api('/api/users');
    const canEdit = role === 'owner';
    const max = state.tenant.plan?.max_users;
    body.innerHTML = `<div class="card">
      <div class="card-head"><h3>Equipe</h3><span class="muted small">${num(list.filter((u) => u.active).length)}${max ? ` de ${max}` : ''} usuário(s) ativos</span><span class="spacer"></span>
        ${canEdit ? `<button class="btn btn-primary btn-sm" id="u-new">${icon('plus')} Novo usuário</button>` : ''}</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${ROLE_LABELS[u.role]}</td>
          <td>${u.active ? '<span class="badge success">Ativo</span>' : '<span class="badge">Inativo</span>'}</td>
          <td class="right">${canEdit ? `<button class="btn btn-sm" data-user="${u.id}">${icon('edit')} Editar</button>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="card-body small muted"><b>Proprietário</b>: acesso total. <b>Gerente</b>: produtos, estoque, vendas e relatórios. <b>Caixa</b>: PDV e as próprias vendas.</div>
    </div>`;

    const modal = (u = null) => {
      const self = u?.id === state.user.id;
      const m = openModal({
        title: u ? 'Editar usuário' : 'Novo usuário',
        body: `<form id="uf" class="form-grid">
          <label class="field full">Nome<input class="input" name="name" required maxlength="120" value="${esc(u?.name || '')}"></label>
          <label class="field full">E-mail<input class="input" name="email" type="email" required value="${esc(u?.email || '')}"></label>
          <label class="field">Perfil<select class="input" name="role" ${self ? 'disabled' : ''}>
            ${['cashier', 'manager', 'owner'].map((r) => `<option value="${r}" ${u?.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}</select></label>
          <label class="field">${u ? 'Nova senha' : 'Senha'}<span class="hint">${u ? 'Deixe em branco para manter.' : 'Mínimo de 8 caracteres.'}</span>
            <input class="input" name="password" type="password" ${u ? '' : 'required'} minlength="8" autocomplete="new-password"></label>
          ${u && !self ? `<label class="check full"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Usuário ativo</label>` : ''}
        </form>`,
        foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" form="uf">Salvar</button>`,
      });
      m.el.querySelector('#uf').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(e.target);
        if (u && !self) v.active = !!v.active;
        withBusy(e.submitter, async () => {
          await api(u ? `/api/users/${u.id}` : '/api/users', { method: u ? 'PUT' : 'POST', body: v });
          toast('Usuário salvo.', 'success');
          m.close();
          users();
        }).catch(() => {});
      });
    };
    body.querySelector('#u-new')?.addEventListener('click', () => modal());
    body.querySelectorAll('[data-user]').forEach((b) => b.addEventListener('click', () => modal(list.find((u) => u.id === Number(b.dataset.user)))));
  }

  function account() {
    body.innerHTML = `<form class="card" id="pwf" style="max-width:480px">
      <div class="card-head"><h3>Alterar senha</h3></div>
      <div class="card-body stack">
        <p class="muted">${esc(state.user.name)} · ${esc(state.user.email)}</p>
        <label class="field">Senha atual<input class="input" type="password" name="current" required autocomplete="current-password"></label>
        <label class="field">Nova senha<input class="input" type="password" name="password" required minlength="8" autocomplete="new-password"></label>
        <button class="btn btn-primary">Atualizar senha</button>
      </div></form>`;
    body.querySelector('#pwf').addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(e.submitter, async () => {
        await api('/api/auth/password', { method: 'POST', body: formValues(e.target) });
        e.target.reset();
        toast('Senha atualizada.', 'success');
      }).catch(() => {});
    });
  }

  function plan() {
    const t = state.tenant;
    const p = t.plan;
    const badge = { trial: 'primary', active: 'success', suspended: 'danger', cancelled: 'danger' }[t.status];
    body.innerHTML = `<div class="grid grid-2" style="align-items:start">
      <div class="card card-pad stack">
        <div class="row"><h3 style="font-size:20px">Plano ${esc(p?.name || '—')}</h3><span class="badge ${badge}">${STATUS_LABELS[t.status]}</span></div>
        <div style="font-size:30px;font-weight:800">${money(p?.price_cents)}<span class="muted" style="font-size:14px;font-weight:500"> /mês</span></div>
        ${t.status === 'trial' ? `<div class="banner info">Período de teste até <b>${fmtDate(t.trial_ends_at)}</b>.</div>` : ''}
        ${!t.subscription.ok ? `<div class="banner danger">${esc(t.subscription.reason)}</div>` : ''}
        <ul style="margin:0;padding-left:18px">${(p?.features || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <p class="small muted">Limites: ${p?.max_users ? `${p.max_users} usuários` : 'usuários ilimitados'} · ${p?.max_products ? `${num(p.max_products)} produtos` : 'produtos ilimitados'}.</p>
      </div>
      <div class="card card-pad stack">
        <h3>Precisa mudar de plano?</h3>
        <p class="muted">Upgrades, faturamento e reativação de conta são feitos pela equipe ${esc(brand().vendorName)}.</p>
        ${brand().supportEmail ? `<a class="btn" href="mailto:${esc(brand().supportEmail)}">${esc(brand().supportEmail)}</a>` : ''}
        ${brand().supportWhatsapp ? `<span>WhatsApp: <b>${esc(brand().supportWhatsapp)}</b></span>` : ''}
        <p class="small muted">Cliente desde ${fmtDate(t.created_at)}.</p>
      </div></div>`;
  }

  const views = { identity, users, account, plan };
  const show = (k) => {
    tab = k;
    el.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === k));
    views[k]();
  };
  el.querySelector('.tabs').addEventListener('click', (e) => e.target.dataset.tab && show(e.target.dataset.tab));
  show(tab);
}
