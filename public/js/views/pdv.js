// Frente de caixa: busca/leitor de código de barras, carrinho e pagamento.
import { api, money, esc, icon, toast, openModal, parseMoney, PAYMENT_LABELS } from '../core.js';
import { printReceipt } from '../docs.js';

// Espelha CASHIER_DISCOUNT_LIMIT_PCT do servidor (que é quem decide de fato).
const DISCOUNT_LIMIT_PCT = 10;

/** Pede e-mail e senha de um gerente/dono. Resolve com { email, password } ou null se cancelado. */
function askAuthorization(message) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: 'Autorização de desconto',
      body: `<p class="muted" style="margin-bottom:14px">${esc(message)}</p>
        <form id="auth-f" class="stack" style="gap:12px" autocomplete="off">
          <label class="field">E-mail do gerente ou dono<input class="input" name="email" type="email" required autocomplete="off"></label>
          <label class="field">Senha<input class="input" name="password" type="password" required autocomplete="new-password"></label>
        </form>`,
      foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" form="auth-f">Autorizar</button>`,
      onClose: () => !done && resolve(null),
    });
    m.el.querySelector('#auth-f').addEventListener('submit', (e) => {
      e.preventDefault();
      done = true;
      const f = e.target;
      const cred = { email: f.email.value, password: f.password.value };
      m.close();
      resolve(cred);
    });
  });
}

export async function render(el, { state }) {
  const isCashier = state.user.role === 'cashier';
  let [products, categories] = await Promise.all([api('/api/products'), api('/api/categories')]);
  const cart = new Map(); // product_id -> qty
  let category = 0;
  let method = 'pix';
  let busy = false;

  el.innerHTML = `
    <div class="pdv">
      <section class="stack">
        <div class="row">
          <div style="position:relative;flex:1">
            <input class="input input-lg" id="pdv-search" placeholder="Buscar produto ou passar o código de barras…" autocomplete="off" style="padding-left:42px">
            <span style="position:absolute;left:14px;top:14px;width:20px;color:var(--muted)">${icon('search')}</span>
          </div>
        </div>
        <div class="chips" id="pdv-cats"></div>
        <div class="pdv-products" id="pdv-grid"></div>
      </section>
      <aside class="card cart">
        <div class="card-head"><h3>Venda atual</h3><span class="spacer"></span><button class="btn btn-ghost btn-sm" id="pdv-clear">Limpar</button></div>
        <div class="cart-items" id="pdv-cart"></div>
        <div class="cart-totals">
          <div class="line muted"><span>Subtotal</span><span class="num" id="pdv-subtotal">R$ 0,00</span></div>
          <div class="line" style="align-items:center"><span class="muted">Desconto (R$)</span><input class="input" id="pdv-discount" style="width:120px;text-align:right" inputmode="decimal" placeholder="0,00"></div>
          ${isCashier ? `<div class="small muted" id="pdv-discount-hint">Até ${DISCOUNT_LIMIT_PCT}% sem autorização do gerente.</div>` : ''}
          <div class="line" style="align-items:baseline"><span style="font-weight:700">Total</span><span class="grand" id="pdv-total">R$ 0,00</span></div>
          <div class="pay-methods" id="pdv-methods">
            ${['pix', 'dinheiro', 'debito', 'credito'].map((m) => `<button data-method="${m}">${PAYMENT_LABELS[m]}</button>`).join('')}
          </div>
          <div class="line hidden" id="pdv-cash" style="align-items:center;gap:10px">
            <input class="input" id="pdv-paid" inputmode="decimal" placeholder="Valor recebido">
            <span class="muted" style="white-space:nowrap">Troco <b class="num" id="pdv-change">R$ 0,00</b></span>
          </div>
          <input class="input" id="pdv-customer" placeholder="Nome do cliente (opcional)" maxlength="120">
          <button class="btn btn-primary btn-lg btn-block" id="pdv-finish">Finalizar venda <kbd style="margin-left:6px">F2</kbd></button>
          <div class="small muted" style="text-align:center"><kbd>F4</kbd> buscar · <kbd>Enter</kbd> adicionar · <kbd>Esc</kbd> limpar busca</div>
        </div>
      </aside>
    </div>`;

  const $ = (id) => el.querySelector(`#${id}`);
  const search = $('pdv-search');
  const byId = () => new Map(products.map((p) => [p.id, p]));

  function filtered() {
    const q = search.value.trim().toLowerCase();
    return products.filter(
      (p) => (!category || p.category_id === category) && (!q || p.name.toLowerCase().includes(q) || p.barcode === q || p.sku.toLowerCase() === q)
    );
  }

  function renderCats() {
    $('pdv-cats').innerHTML = [{ id: 0, name: 'Todos' }, ...categories.filter((c) => c.product_count)]
      .map((c) => `<button class="chip ${c.id === category ? 'active' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`)
      .join('');
  }

  function renderGrid() {
    const list = filtered();
    $('pdv-grid').innerHTML = list.length
      ? list
          .slice(0, 120)
          .map((p) => {
            const low = p.stock <= p.min_stock;
            return `<button class="p-card" data-add="${p.id}">
              <span class="p-name">${esc(p.name)}</span>
              <span class="p-stock ${low ? 'low' : ''}">Estoque: ${p.stock} ${esc(p.unit)}</span>
              <span class="p-price">${money(p.price_cents)}</span></button>`;
          })
          .join('')
      : '<div class="empty" style="grid-column:1/-1">Nenhum produto encontrado.</div>';
  }

  function totals() {
    const map = byId();
    let subtotal = 0;
    for (const [id, qty] of cart) subtotal += (map.get(id)?.price_cents || 0) * qty;
    const discount = Math.min(parseMoney($('pdv-discount').value), subtotal);
    return { subtotal, discount, total: subtotal - discount };
  }

  function renderCart() {
    const map = byId();
    $('pdv-cart').innerHTML = cart.size
      ? [...cart]
          .map(([id, qty]) => {
            const p = map.get(id);
            return `<div class="cart-line">
              <div><div class="name">${esc(p.name)}</div><div class="small muted">${money(p.price_cents)} / ${esc(p.unit)}</div></div>
              <div class="qty"><button data-dec="${id}" aria-label="Diminuir">−</button><span>${qty}</span><button data-inc="${id}" aria-label="Aumentar">+</button></div>
              <div class="num" style="min-width:84px;text-align:right;font-weight:700">${money(p.price_cents * qty)}</div>
            </div>`;
          })
          .join('')
      : `<div class="empty">${icon('cart', 'muted')}<p style="margin-top:8px">Clique em um produto ou passe o código de barras.</p></div>`;
    const t = totals();
    $('pdv-subtotal').textContent = money(t.subtotal);
    $('pdv-total').textContent = money(t.total);
    el.querySelectorAll('[data-method]').forEach((b) => b.classList.toggle('active', b.dataset.method === method));
    $('pdv-cash').classList.toggle('hidden', method !== 'dinheiro');
    const paid = parseMoney($('pdv-paid').value);
    $('pdv-change').textContent = money(Math.max(0, paid - t.total));
    $('pdv-finish').disabled = !cart.size || busy;
  }

  function add(id, qty = 1) {
    const p = byId().get(id);
    if (!p) return;
    const next = (cart.get(id) || 0) + qty;
    if (next <= 0) cart.delete(id);
    else {
      if (!state.tenant.allow_negative_stock && next > p.stock) {
        toast(`Estoque insuficiente de ${p.name} (disponível: ${p.stock}).`, 'error');
        return;
      }
      cart.set(id, next);
    }
    renderCart();
  }

  async function finish(authorization = undefined) {
    if (!cart.size || busy) return;
    const t = totals();
    const body = {
      items: [...cart].map(([product_id, qty]) => ({ product_id, qty })),
      payment_method: method,
      discount_cents: t.discount,
      customer_name: $('pdv-customer').value,
      authorization,
    };
    if (method === 'dinheiro') {
      body.amount_paid_cents = $('pdv-paid').value ? parseMoney($('pdv-paid').value) : t.total;
      if (body.amount_paid_cents < t.total) return toast('Valor recebido é menor que o total.', 'error');
    }
    busy = true;
    renderCart();
    try {
      const sale = await api('/api/sales', { method: 'POST', body });
      cart.clear();
      ['pdv-discount', 'pdv-paid', 'pdv-customer'].forEach((id) => ($(id).value = ''));
      products = await api('/api/products');
      renderGrid();
      const m = openModal({
        title: `Venda nº ${sale.number} concluída`,
        body: `<div style="text-align:center">
          <div style="width:56px;height:56px;border-radius:50%;background:var(--success-soft);color:var(--success);display:grid;place-items:center;margin:0 auto 12px">${icon('check')}</div>
          <div class="muted">Total</div><div style="font-size:32px;font-weight:800">${money(sale.total_cents)}</div>
          <div class="muted">${esc(PAYMENT_LABELS[sale.payment_method])}${sale.change_cents ? ` · Troco <b>${money(sale.change_cents)}</b>` : ''}</div></div>`,
        foot: `<button class="btn" data-print>${icon('print')} Imprimir cupom</button><button class="btn btn-primary" data-close>Nova venda</button>`,
        onClose: () => search.focus(),
      });
      m.el.querySelector('[data-print]').addEventListener('click', () => printReceipt(sale, state.tenant));
      m.el.querySelector('.btn-primary').focus();
    } catch (err) {
      if (err.code === 'DISCOUNT_AUTH_REQUIRED' || err.code === 'DISCOUNT_AUTH_INVALID') {
        busy = false;
        renderCart();
        const cred = await askAuthorization(err.message);
        if (cred) return await finish(cred);
        return search.focus();
      }
      toast(err.message, 'error');
    } finally {
      busy = false;
      renderCart();
    }
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.add) add(Number(t.dataset.add));
    else if (t.dataset.inc) add(Number(t.dataset.inc), 1);
    else if (t.dataset.dec) add(Number(t.dataset.dec), -1);
    else if (t.dataset.cat !== undefined) {
      category = Number(t.dataset.cat);
      renderCats();
      renderGrid();
    } else if (t.dataset.method) {
      method = t.dataset.method;
      renderCart();
      if (method === 'dinheiro') $('pdv-paid').focus();
    } else if (t.id === 'pdv-clear') {
      cart.clear();
      renderCart();
    } else if (t.id === 'pdv-finish') finish();
  });

  search.addEventListener('input', renderGrid);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      search.value = '';
      renderGrid();
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = search.value.trim();
    if (!q) return;
    const exact = products.find((p) => p.barcode === q || (p.sku && p.sku === q));
    const list = filtered();
    const hit = exact || (list.length === 1 ? list[0] : null);
    if (hit) {
      add(hit.id);
      search.value = '';
      renderGrid();
    } else if (!list.length) toast('Produto não encontrado.', 'error');
  });
  ['pdv-discount', 'pdv-paid'].forEach((id) => $(id).addEventListener('input', renderCart));

  const onKey = (e) => {
    if (document.querySelector('.modal-backdrop')) return;
    if (e.key === 'F2') {
      e.preventDefault();
      finish();
    } else if (e.key === 'F4') {
      e.preventDefault();
      search.focus();
      search.select();
    }
  };
  document.addEventListener('keydown', onKey);

  renderCats();
  renderGrid();
  renderCart();
  search.focus();
  return () => document.removeEventListener('keydown', onKey);
}
