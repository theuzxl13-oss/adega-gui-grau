import { api, money, num, esc, icon, barsHtml, fmtDate, PAYMENT_LABELS, todayStr } from '../core.js';

function delta(cur, prev) {
  if (!prev) return '<div class="delta">—</div>';
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `<div class="delta ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs. ontem</div>`;
}

export async function render(el, { state, actions }) {
  actions.innerHTML = `<a class="btn btn-primary" href="#/pdv">${icon('cart')} Abrir PDV</a>`;
  const d = await api('/api/dashboard');
  const t = d.today;
  const today = todayStr();
  const payTotal = d.payments.reduce((s, p) => s + p.revenue, 0) || 1;

  el.innerHTML = `
    <div class="stack">
      <div>
        <h2 style="font-size:22px">Olá, ${esc(state.user.name.split(' ')[0])}!</h2>
        <p class="muted">Resumo da ${esc(state.tenant.name)} em ${fmtDate(today)}.</p>
      </div>
      <div class="grid grid-4">
        <div class="card kpi"><div class="label">Faturamento hoje</div><div class="value">${money(t.revenue)}</div>${delta(t.revenue, d.yesterday.revenue)}</div>
        <div class="card kpi"><div class="label">Vendas hoje</div><div class="value">${num(t.count)}</div>${delta(t.count, d.yesterday.count)}</div>
        <div class="card kpi"><div class="label">Ticket médio hoje</div><div class="value">${money(t.avg_ticket)}</div><div class="delta">Ontem: ${money(d.yesterday.avg_ticket)}</div></div>
        <div class="card kpi"><div class="label">Faturamento no mês</div><div class="value">${money(d.month.revenue)}</div><div class="delta">Lucro bruto estimado: ${money(d.month.profit)}</div></div>
      </div>
      <div class="grid grid-2-1">
        <div class="card">
          <div class="card-head"><h3>Faturamento — últimos 14 dias</h3></div>
          <div class="card-body">${barsHtml(
            d.series.map((s) => ({ label: s.day.slice(8, 10), title: fmtDate(s.day), value: s.revenue, highlight: s.day === today }))
          )}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Formas de pagamento (mês)</h3></div>
          <div class="card-body stack">
            ${d.payments.length ? d.payments.map((p) => `
              <div><div class="row"><b>${esc(PAYMENT_LABELS[p.method] || p.method)}</b><span class="spacer"></span><span class="num">${money(p.revenue)}</span></div>
              <div class="meter" style="margin-top:6px"><span style="width:${(p.revenue / payTotal) * 100}%"></span></div>
              <div class="small muted">${num(p.count)} vendas · ${Math.round((p.revenue / payTotal) * 100)}%</div></div>`).join('')
              : '<div class="empty">Sem vendas no mês.</div>'}
          </div>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h3>Mais vendidos no mês</h3><span class="spacer"></span><a href="#/relatorios" class="small">Ver relatório</a></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Faturamento</th></tr></thead>
            <tbody>${d.top.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${num(p.qty)}</td><td class="num">${money(p.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sem vendas.</td></tr>'}</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Estoque baixo</h3><span class="spacer"></span><a href="#/produtos" class="small">Gerenciar</a></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Produto</th><th class="num">Atual</th><th class="num">Mínimo</th></tr></thead>
            <tbody>${d.low_stock.map((p) => `<tr><td>${esc(p.name)}</td><td class="num"><span class="badge danger">${num(p.stock)} ${esc(p.unit)}</span></td><td class="num">${num(p.min_stock)}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">${d.product_count ? 'Tudo em ordem por aqui.' : 'Cadastre seus produtos para começar.'}</td></tr>`}</tbody>
          </table></div>
        </div>
      </div>
    </div>`;
}
