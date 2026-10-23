// Relatórios de vendas e de estoque, com exportação para impressão/PDF.
import { api, money, num, esc, icon, barsHtml, fmtDate, fmtDateTime, todayStr, PAYMENT_LABELS } from '../core.js';
import { printReport } from '../docs.js';

const PRESETS = [
  ['Hoje', 0, 0],
  ['7 dias', -6, 0],
  ['30 dias', -29, 0],
  ['Este mês', 'month', 0],
];

const table = (head, rows, foot = '') =>
  `<table class="table"><thead><tr>${head.map(([h, n]) => `<th class="${n ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
   <tbody>${rows || `<tr><td colspan="${head.length}" class="empty">Sem dados no período.</td></tr>`}</tbody>${foot}</table>`;

export async function render(el, { state, actions }) {
  let tab = 'sales';
  const f = { from: todayStr(-29), to: todayStr() };
  let data = null;
  let stock = null;

  actions.innerHTML = `<button class="btn btn-primary" id="r-print">${icon('print')} Gerar PDF</button>`;
  el.innerHTML = `
    <div class="tabs"><button class="tab active" data-tab="sales">Vendas</button><button class="tab" data-tab="stock">Estoque</button></div>
    <div id="r-filters" class="row wrap" style="margin-bottom:18px">
      <div class="chips">${PRESETS.map(([l], i) => `<button class="chip ${i === 2 ? 'active' : ''}" data-preset="${i}">${l}</button>`).join('')}</div>
      <input class="input" type="date" id="r-from" value="${f.from}" style="max-width:170px">
      <span class="muted">até</span>
      <input class="input" type="date" id="r-to" value="${f.to}" style="max-width:170px">
    </div>
    <div id="r-body"><div class="empty">Carregando…</div></div>`;
  const $ = (id) => el.querySelector(`#${id}`);

  const sections = {
    payment: (d) => table([['Forma de pagamento'], ['Vendas', 1], ['Faturamento', 1]],
      d.by_payment.map((p) => `<tr><td>${esc(PAYMENT_LABELS[p.method] || p.method)}</td><td class="num">${num(p.count)}</td><td class="num">${money(p.revenue)}</td></tr>`).join('')),
    category: (d) => table([['Categoria'], ['Itens', 1], ['Faturamento', 1]],
      d.by_category.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${num(c.qty)}</td><td class="num">${money(c.revenue)}</td></tr>`).join('')),
    products: (d) => table([['#'], ['Produto'], ['Qtd.', 1], ['Faturamento', 1], ['Lucro bruto', 1]],
      d.top_products.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td class="num">${num(p.qty)}</td><td class="num">${money(p.revenue)}</td><td class="num">${money(p.profit)}</td></tr>`).join('')),
    users: (d) => table([['Operador'], ['Vendas', 1], ['Faturamento', 1]],
      d.by_user.map((u) => `<tr><td>${esc(u.user)}</td><td class="num">${num(u.count)}</td><td class="num">${money(u.revenue)}</td></tr>`).join('')),
    days: (d) => table([['Dia'], ['Vendas', 1], ['Faturamento', 1]],
      d.by_day.filter((x) => x.count).map((x) => `<tr><td>${fmtDate(x.day)}</td><td class="num">${num(x.count)}</td><td class="num">${money(x.revenue)}</td></tr>`).join(''),
      `<tfoot><tr><td>Total</td><td class="num">${num(d.summary.count)}</td><td class="num">${money(d.summary.revenue)}</td></tr></tfoot>`),
    stock: (s) => table([['Produto'], ['Categoria'], ['Estoque', 1], ['Mínimo', 1], ['Custo un.', 1], ['Valor (custo)', 1], ['Valor (venda)', 1]],
      s.items.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td class="num">${p.stock <= p.min_stock ? `<b style="color:var(--danger)">${num(p.stock)}</b>` : num(p.stock)}</td>
        <td class="num">${num(p.min_stock)}</td><td class="num">${money(p.cost_cents)}</td><td class="num">${money(Math.max(p.stock, 0) * p.cost_cents)}</td><td class="num">${money(Math.max(p.stock, 0) * p.price_cents)}</td></tr>`).join(''),
      `<tfoot><tr><td colspan="2">Total</td><td class="num">${num(s.totals.units)}</td><td></td><td></td><td class="num">${money(s.totals.cost)}</td><td class="num">${money(s.totals.retail)}</td></tr></tfoot>`),
  };

  const kpis = (d) => {
    const s = d.summary;
    const margin = s.revenue ? Math.round((s.profit / s.revenue) * 100) : 0;
    return [
      ['Faturamento', money(s.revenue)],
      ['Vendas', num(s.count)],
      ['Ticket médio', money(s.avg_ticket)],
      ['Lucro bruto estimado', `${money(s.profit)} (${margin}%)`],
      ['Custo das mercadorias', money(s.cost)],
      ['Descontos concedidos', money(s.discount)],
      ['Vendas canceladas', `${num(d.cancelled.count)} · ${money(d.cancelled.total)}`],
    ];
  };

  function drawSales() {
    const d = data;
    $('r-body').innerHTML = `<div class="stack">
      <div class="grid grid-4">${kpis(d).slice(0, 4).map(([l, v]) => `<div class="card kpi"><div class="label">${l}</div><div class="value" style="font-size:22px">${v}</div></div>`).join('')}</div>
      <div class="row wrap muted small">${kpis(d).slice(4).map(([l, v]) => `<span>${l}: <b>${v}</b></span>`).join('<span>·</span>')}</div>
      <div class="card"><div class="card-head"><h3>Faturamento por dia</h3></div><div class="card-body">
        ${barsHtml(d.by_day.slice(-62).map((x) => ({ label: d.by_day.length > 16 ? x.day.slice(8, 10) : fmtDate(x.day).slice(0, 5), title: fmtDate(x.day), value: x.revenue })))}</div></div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3>Por forma de pagamento</h3></div><div class="table-wrap">${sections.payment(d)}</div></div>
        <div class="card"><div class="card-head"><h3>Por categoria</h3></div><div class="table-wrap">${sections.category(d)}</div></div>
      </div>
      <div class="grid grid-2-1">
        <div class="card"><div class="card-head"><h3>Produtos mais vendidos</h3></div><div class="table-wrap">${sections.products(d)}</div></div>
        <div class="card"><div class="card-head"><h3>Por operador</h3></div><div class="table-wrap">${sections.users(d)}</div></div>
      </div>
    </div>`;
  }

  function drawStock() {
    const s = stock;
    $('r-body').innerHTML = `<div class="stack">
      <div class="grid grid-4">
        <div class="card kpi"><div class="label">Itens em estoque</div><div class="value">${num(s.totals.units)}</div></div>
        <div class="card kpi"><div class="label">Valor a preço de custo</div><div class="value">${money(s.totals.cost)}</div></div>
        <div class="card kpi"><div class="label">Valor a preço de venda</div><div class="value">${money(s.totals.retail)}</div></div>
        <div class="card kpi"><div class="label">Produtos em estoque baixo</div><div class="value">${num(s.totals.low)}</div></div>
      </div>
      <div class="card"><div class="table-wrap">${sections.stock(s)}</div></div></div>`;
  }

  async function load() {
    $('r-filters').classList.toggle('hidden', tab !== 'sales');
    $('r-body').innerHTML = '<div class="empty">Carregando…</div>';
    try {
      if (tab === 'sales') {
        data = await api(`/api/reports/sales?from=${f.from}&to=${f.to}`);
        drawSales();
      } else {
        stock = await api('/api/reports/stock');
        drawStock();
      }
    } catch (err) {
      $('r-body').innerHTML = `<div class="card card-pad empty">${esc(err.message)}</div>`;
    }
  }

  function print() {
    if (tab === 'sales' && data) {
      const k = kpis(data);
      printReport(
        {
          title: 'Relatório de vendas',
          subtitle: `Período: ${fmtDate(data.from)} a ${fmtDate(data.to)}`,
          sections: [
            { html: `<div class="kpis">${k.slice(0, 4).map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join('')}</div>
              <p style="margin-top:8px;color:#6A6E86">${k.slice(4).map(([l, v]) => `${l}: <b>${v}</b>`).join(' · ')}</p>` },
            { title: 'Faturamento por dia', html: sections.days(data) },
            { title: 'Por forma de pagamento', html: sections.payment(data) },
            { title: 'Por categoria', html: sections.category(data) },
            { title: 'Produtos mais vendidos', html: sections.products(data) },
            { title: 'Por operador', html: sections.users(data) },
          ],
        },
        state.tenant
      );
    } else if (stock) {
      printReport(
        { title: 'Posição de estoque', subtitle: `Posição em ${fmtDateTime(stock.generated_at)}`, sections: [{ html: sections.stock(stock) }] },
        state.tenant
      );
    }
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) {
      tab = b.dataset.tab;
      el.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
      load();
    }
    if (b.dataset.preset !== undefined) {
      const [, a] = PRESETS[b.dataset.preset];
      f.from = a === 'month' ? `${todayStr().slice(0, 8)}01` : todayStr(a);
      f.to = todayStr();
      $('r-from').value = f.from;
      $('r-to').value = f.to;
      el.querySelectorAll('[data-preset]').forEach((c) => c.classList.toggle('active', c === b));
      load();
    }
  });
  ['r-from', 'r-to'].forEach((id) =>
    $(id).addEventListener('change', () => {
      f.from = $('r-from').value;
      f.to = $('r-to').value;
      el.querySelectorAll('[data-preset]').forEach((c) => c.classList.remove('active'));
      load();
    })
  );
  actions.querySelector('#r-print').addEventListener('click', print);
  await load();
}
