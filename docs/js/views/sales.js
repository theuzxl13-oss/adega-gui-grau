// Histórico de vendas: consulta, reimpressão de cupom e cancelamento.
import { api, money, num, esc, icon, toast, openModal, fmtDateTime, todayStr, PAYMENT_LABELS } from '../core.js';
import { printReceipt } from '../docs.js';

export async function render(el, { state }) {
  const canCancel = state.user.role !== 'cashier';
  const f = { from: todayStr(), to: todayStr(), status: '' };

  el.innerHTML = `
    <div class="card">
      <div class="card-head row wrap">
        <label class="field" style="flex-direction:row;align-items:center">De <input class="input" type="date" id="s-from" value="${f.from}"></label>
        <label class="field" style="flex-direction:row;align-items:center">até <input class="input" type="date" id="s-to" value="${f.to}"></label>
        <select class="input" id="s-status" style="max-width:180px"><option value="">Todas</option><option value="completed">Concluídas</option><option value="cancelled">Canceladas</option></select>
        <span class="spacer"></span><span id="s-sum" class="muted"></span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Nº</th><th>Data</th><th>Operador</th><th>Cliente</th><th>Pagamento</th><th class="num">Itens</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody id="s-body"></tbody>
      </table></div>
    </div>`;
  const $ = (id) => el.querySelector(`#${id}`);

  async function load() {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    const list = await api(`/api/sales?${qs}`);
    const ok = list.filter((s) => s.status === 'completed');
    $('s-sum').innerHTML = `${num(ok.length)} venda(s) · <b>${money(ok.reduce((t, s) => t + s.total_cents, 0))}</b>`;
    $('s-body').innerHTML =
      list
        .map(
          (s) => `<tr class="clickable" data-id="${s.id}">
          <td><b>${s.number}</b></td><td>${fmtDateTime(s.created_at)}</td><td>${esc(s.user_name || '—')}</td>
          <td>${esc(s.customer_name || '—')}</td><td>${esc(PAYMENT_LABELS[s.payment_method] || s.payment_method)}</td>
          <td class="num">${num(s.item_count)}</td><td class="num"><b>${money(s.total_cents)}</b></td>
          <td>${s.status === 'completed' ? '<span class="badge success">Concluída</span>' : '<span class="badge danger">Cancelada</span>'}</td></tr>`
        )
        .join('') || '<tr><td colspan="8" class="empty">Nenhuma venda no período.</td></tr>';
  }

  async function detail(id) {
    const s = await api(`/api/sales/${id}`);
    const m = openModal({
      title: `Venda nº ${s.number}`,
      wide: true,
      body: `<div class="row wrap" style="margin-bottom:14px;gap:24px">
          <div><div class="small muted">Data</div><b>${fmtDateTime(s.created_at)}</b></div>
          <div><div class="small muted">Operador</div><b>${esc(s.user_name || '—')}</b></div>
          <div><div class="small muted">Pagamento</div><b>${esc(PAYMENT_LABELS[s.payment_method])}</b></div>
          ${s.customer_name ? `<div><div class="small muted">Cliente</div><b>${esc(s.customer_name)}</b></div>` : ''}
          <div>${s.status === 'completed' ? '<span class="badge success">Concluída</span>' : `<span class="badge danger">Cancelada</span> <span class="small muted">${esc(s.cancel_reason)}</span>`}</div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead>
          <tbody>${s.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${num(i.qty)}</td><td class="num">${money(i.unit_price_cents)}</td><td class="num">${money(i.total_cents)}</td></tr>`).join('')}</tbody>
          <tfoot>
            <tr><td colspan="3" class="right muted">Subtotal</td><td class="num">${money(s.subtotal_cents)}</td></tr>
            ${s.discount_cents ? `<tr><td colspan="3" class="right muted">Desconto${s.discount_authorized_by_name ? ` (autorizado por ${esc(s.discount_authorized_by_name)})` : ''}</td><td class="num">− ${money(s.discount_cents)}</td></tr>` : ''}
            <tr><td colspan="3" class="right"><b>Total</b></td><td class="num"><b>${money(s.total_cents)}</b></td></tr>
          </tfoot>
        </table></div>`,
      foot: `${canCancel && s.status === 'completed' ? `<button class="btn btn-danger" data-cancel>Cancelar venda</button><span class="spacer"></span>` : ''}
        <button class="btn" data-print>${icon('print')} Imprimir cupom</button><button class="btn btn-primary" data-close>Fechar</button>`,
    });
    m.el.querySelector('[data-print]').addEventListener('click', () => printReceipt(s, state.tenant));
    m.el.querySelector('[data-cancel]')?.addEventListener('click', () => {
      m.close();
      const c = openModal({
        title: `Cancelar venda nº ${s.number}`,
        body: `<p class="muted" style="margin-bottom:12px">Os itens voltam para o estoque e a venda deixa de contar nos relatórios.</p>
          <label class="field">Motivo<input class="input" id="c-reason" maxlength="160" placeholder="Ex.: desistência do cliente"></label>`,
        foot: `<button class="btn" data-close>Voltar</button><button class="btn btn-danger" data-ok>Confirmar cancelamento</button>`,
      });
      c.el.querySelector('[data-ok]').addEventListener('click', async () => {
        try {
          await api(`/api/sales/${s.id}/cancel`, { method: 'POST', body: { reason: c.el.querySelector('#c-reason').value } });
          toast('Venda cancelada e estoque devolvido.', 'success');
          c.close();
          load();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  $('s-from').addEventListener('change', (e) => ((f.from = e.target.value), load()));
  $('s-to').addEventListener('change', (e) => ((f.to = e.target.value), load()));
  $('s-status').addEventListener('change', (e) => ((f.status = e.target.value), load()));
  el.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-id]');
    if (row) detail(row.dataset.id);
  });
  await load();
}
