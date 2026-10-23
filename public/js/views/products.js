// Cadastro de produtos, categorias e movimentações de estoque.
import { api, money, num, esc, icon, toast, openModal, confirmDialog, parseMoney, centsToInput, formValues, withBusy, fmtDateTime } from '../core.js';

const MOVE_LABELS = { in: 'Entrada', out: 'Saída', adjust: 'Ajuste', sale: 'Venda', cancel: 'Cancelamento', initial: 'Estoque inicial' };

export async function render(el, { actions }) {
  let categories = await api('/api/categories');
  let products = [];
  const filters = { q: '', category: '', low: false };

  actions.innerHTML = `<button class="btn" id="btn-cats">${icon('tag')} Categorias</button>
    <button class="btn btn-primary" id="btn-new">${icon('plus')} Novo produto</button>`;

  el.innerHTML = `
    <div class="card">
      <div class="card-head row wrap">
        <input class="input" id="f-q" placeholder="Buscar por nome, código ou SKU" style="max-width:320px">
        <select class="input" id="f-cat" style="max-width:220px"></select>
        <label class="check"><input type="checkbox" id="f-low"> Somente estoque baixo</label>
        <span class="spacer"></span><span class="muted small" id="f-count"></span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Produto</th><th>Categoria</th><th class="num">Custo</th><th class="num">Preço</th><th class="num">Margem</th><th class="num">Estoque</th><th></th></tr></thead>
        <tbody id="p-body"></tbody>
      </table></div>
    </div>`;

  const $ = (id) => el.querySelector(`#${id}`);
  const catOptions = (selected, blank = 'Todas as categorias') =>
    `<option value="">${blank}</option>` +
    categories.map((c) => `<option value="${c.id}" ${String(c.id) === String(selected) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  async function load() {
    const qs = new URLSearchParams();
    if (filters.q) qs.set('q', filters.q);
    if (filters.category) qs.set('category', filters.category);
    if (filters.low) qs.set('low', '1');
    products = await api(`/api/products?${qs}`);
    $('f-count').textContent = `${products.length} produto(s)`;
    $('p-body').innerHTML =
      products
        .map((p) => {
          const margin = p.price_cents ? Math.round(((p.price_cents - p.cost_cents) / p.price_cents) * 100) : 0;
          const low = p.stock <= p.min_stock;
          return `<tr>
            <td><b>${esc(p.name)}</b><div class="small muted">${esc(p.barcode || p.sku || '—')}</div></td>
            <td>${esc(p.category_name || '—')}</td>
            <td class="num">${money(p.cost_cents)}</td>
            <td class="num"><b>${money(p.price_cents)}</b></td>
            <td class="num">${margin}%</td>
            <td class="num"><span class="badge ${low ? 'danger' : 'success'}">${num(p.stock)} ${esc(p.unit)}</span><div class="small muted">mín. ${num(p.min_stock)}</div></td>
            <td class="right" style="white-space:nowrap">
              <button class="btn btn-sm" data-stock="${p.id}" title="Movimentar estoque">${icon('arrows')} Estoque</button>
              <button class="btn btn-sm btn-ghost icon-btn" data-edit="${p.id}" title="Editar" aria-label="Editar">${icon('edit')}</button>
              <button class="btn btn-sm btn-ghost icon-btn btn-danger" data-del="${p.id}" title="Desativar" aria-label="Desativar">${icon('trash')}</button>
            </td></tr>`;
        })
        .join('') || '<tr><td colspan="7" class="empty">Nenhum produto encontrado.</td></tr>';
  }

  function productModal(p = null) {
    const m = openModal({
      title: p ? 'Editar produto' : 'Novo produto',
      body: `<form id="pf" class="form-grid">
        <label class="field full">Nome<input class="input" name="name" required maxlength="160" value="${esc(p?.name || '')}"></label>
        <label class="field">Categoria<select class="input" name="category_id">${catOptions(p?.category_id, 'Sem categoria')}</select></label>
        <label class="field">Unidade<input class="input" name="unit" maxlength="10" value="${esc(p?.unit || 'UN')}"></label>
        <label class="field">Código de barras<input class="input" name="barcode" maxlength="60" value="${esc(p?.barcode || '')}"></label>
        <label class="field">SKU / código interno<input class="input" name="sku" maxlength="60" value="${esc(p?.sku || '')}"></label>
        <label class="field">Preço de custo (R$)<input class="input" name="cost" inputmode="decimal" value="${p ? centsToInput(p.cost_cents) : ''}" placeholder="0,00"></label>
        <label class="field">Preço de venda (R$)<input class="input" name="price" inputmode="decimal" required value="${p ? centsToInput(p.price_cents) : ''}" placeholder="0,00"></label>
        ${p ? '' : '<label class="field">Estoque inicial<input class="input" name="stock" type="number" min="0" step="1" value="0"></label>'}
        <label class="field">Estoque mínimo<span class="hint">Alerta quando atingir este valor.</span><input class="input" name="min_stock" type="number" min="0" step="1" value="${p?.min_stock ?? 0}"></label>
      </form>`,
      foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" form="pf">Salvar</button>`,
    });
    m.el.querySelector('#pf').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(e.target);
      const body = { ...v, cost_cents: parseMoney(v.cost), price_cents: parseMoney(v.price), category_id: v.category_id || null };
      withBusy(e.submitter, async () => {
        await api(p ? `/api/products/${p.id}` : '/api/products', { method: p ? 'PUT' : 'POST', body });
        toast(p ? 'Produto atualizado.' : 'Produto cadastrado.', 'success');
        m.close();
        categories = await api('/api/categories');
        load();
      }).catch(() => {});
    });
  }

  async function stockModal(p) {
    const moves = await api(`/api/products/${p.id}/movements`);
    const m = openModal({
      title: `Estoque — ${p.name}`,
      wide: true,
      body: `<div class="row wrap" style="margin-bottom:16px"><span class="muted">Estoque atual</span><b style="font-size:22px">${num(p.stock)} ${esc(p.unit)}</b></div>
        <form id="sf" class="form-grid" style="grid-template-columns:1fr 1fr 2fr auto;align-items:end">
          <label class="field">Tipo<select class="input" name="type"><option value="in">Entrada</option><option value="out">Saída / perda</option><option value="adjust">Ajuste (contagem)</option></select></label>
          <label class="field">Quantidade<input class="input" name="qty" type="number" min="0" step="1" required></label>
          <label class="field">Motivo<input class="input" name="reason" maxlength="160" placeholder="Ex.: compra do fornecedor, avaria…"></label>
          <button class="btn btn-primary">Registrar</button>
        </form>
        <h4 style="margin:22px 0 8px">Histórico</h4>
        <div class="table-wrap" style="max-height:300px;overflow:auto"><table class="table">
          <thead><tr><th>Data</th><th>Tipo</th><th class="num">Qtd.</th><th class="num">Saldo</th><th>Motivo</th><th>Usuário</th></tr></thead>
          <tbody>${moves.map((mv) => `<tr><td>${fmtDateTime(mv.created_at)}</td><td>${MOVE_LABELS[mv.type] || mv.type}</td>
            <td class="num" style="color:${mv.qty < 0 ? 'var(--danger)' : 'var(--success)'}">${mv.qty > 0 ? '+' : ''}${num(mv.qty)}</td>
            <td class="num">${num(mv.balance)}</td><td>${esc(mv.reason)}</td><td>${esc(mv.user_name || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sem movimentações registradas.</td></tr>'}</tbody>
        </table></div>`,
    });
    m.el.querySelector('#sf').addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(e.submitter, async () => {
        await api(`/api/products/${p.id}/stock`, { method: 'POST', body: formValues(e.target) });
        toast('Estoque atualizado.', 'success');
        m.close();
        load();
      }).catch(() => {});
    });
  }

  function categoriesModal() {
    const draw = () => `<form id="cf" class="row"><input class="input" name="name" placeholder="Nova categoria" required maxlength="80"><button class="btn btn-primary">${icon('plus')} Adicionar</button></form>
      <div class="table-wrap" style="margin-top:14px"><table class="table"><tbody>
      ${categories.map((c) => `<tr><td>${esc(c.name)}</td><td class="num muted">${c.product_count} produto(s)</td>
        <td class="right"><button class="btn btn-sm btn-ghost btn-danger icon-btn" data-delcat="${c.id}" aria-label="Excluir">${icon('trash')}</button></td></tr>`).join('')}
      </tbody></table></div>`;
    const m = openModal({ title: 'Categorias', body: draw() });
    const body = m.el.querySelector('.modal-body');
    const refresh = async () => {
      categories = await api('/api/categories');
      body.innerHTML = draw();
      $('f-cat').innerHTML = catOptions(filters.category);
    };
    body.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(e.submitter, async () => {
        await api('/api/categories', { method: 'POST', body: formValues(e.target) });
        await refresh();
      }).catch(() => {});
    });
    body.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-delcat]')?.dataset.delcat;
      if (!id) return;
      if (!(await confirmDialog('Excluir esta categoria? Os produtos ficarão sem categoria.', { danger: true, ok: 'Excluir' }))) return;
      await api(`/api/categories/${id}`, { method: 'DELETE' });
      await refresh();
      load();
    });
  }

  $('f-cat').innerHTML = catOptions('');
  let timer;
  $('f-q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => ((filters.q = e.target.value.trim()), load()), 250);
  });
  $('f-cat').addEventListener('change', (e) => ((filters.category = e.target.value), load()));
  $('f-low').addEventListener('change', (e) => ((filters.low = e.target.checked), load()));
  actions.querySelector('#btn-new').addEventListener('click', () => productModal());
  actions.querySelector('#btn-cats').addEventListener('click', categoriesModal);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const find = (id) => products.find((p) => p.id === Number(id));
    if (b.dataset.edit) productModal(find(b.dataset.edit));
    if (b.dataset.stock) stockModal(find(b.dataset.stock));
    if (b.dataset.del) {
      const p = find(b.dataset.del);
      if (!(await confirmDialog(`Desativar "${p.name}"? Ele deixa de aparecer no PDV, mas o histórico de vendas é mantido.`, { danger: true, ok: 'Desativar' }))) return;
      await api(`/api/products/${p.id}`, { method: 'DELETE' });
      toast('Produto desativado.');
      load();
    }
  });
  await load();
}
