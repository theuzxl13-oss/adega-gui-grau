// Documentos impressos (cupom de venda e relatórios).
// Cabeçalho com a identidade da adega; rodapé com a assinatura do software Kzann Tech.
import { esc, money, fmtDateTime, fmtDate, todayStr, brand, PAYMENT_LABELS, initials } from './core.js';

const abs = (url) => (url && !url.startsWith('data:') ? new URL(url, location.href).href : url);

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', system-ui, 'Segoe UI', Roboto, sans-serif; color: #191830; background: #EEF0F5; }
  .toolbar { position: sticky; top: 0; display: flex; gap: 8px; justify-content: center; padding: 12px; background: #15122B; }
  .toolbar button { height: 36px; padding: 0 16px; border-radius: 8px; border: 0; font: inherit; font-weight: 600; cursor: pointer; }
  .toolbar .primary { background: var(--accent); color: var(--on-accent); }
  .paper { background: #fff; margin: 24px auto; box-shadow: 0 8px 30px rgba(0,0,0,.12); }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  .vendor { display: flex; align-items: center; gap: 8px; justify-content: center; color: #6A6E86; }
  .vendor img { width: 16px; height: 16px; border-radius: 4px; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .paper { margin: 0; box-shadow: none; }
  }`;

function openWindow(title, css, body, accent) {
  let w = window.open('', '_blank');
  if (!w) {
    // Pop-up bloqueado: mostra o documento numa camada sobre a própria página.
    const frame = document.createElement('iframe');
    frame.title = title;
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:1000;background:#EEF0F5';
    document.body.appendChild(frame);
    w = frame.contentWindow;
  }
  const on = accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#5B3DF5';
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
    <link rel="icon" href="${esc(abs(brand().logoUrl))}">
    <style>:root{--accent:${on};--on-accent:#fff;--danger:#D93D45}${BASE_CSS}${css}</style></head>
    <body><div class="toolbar"><button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button>
    <button onclick="window.frameElement ? window.frameElement.remove() : window.close()">Fechar</button></div>${body}</body></html>`);
  w.document.close();
}

function vendorLine(prefix) {
  const b = brand();
  return `<div class="vendor"><img src="${esc(abs(b.logoUrl))}" alt=""><span>${esc(prefix)} <b>${esc(b.productName)}</b> · ${esc(b.slogan)}</span></div>`;
}

function tenantHeaderLines(t) {
  return [
    t.legal_name,
    t.cnpj && `CNPJ ${t.cnpj}`,
    [t.address, t.city].filter(Boolean).join(' — '),
    [t.phone, t.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
}

// ---------- Cupom de venda (80 mm, não fiscal) ----------
export function printReceipt(sale, tenant) {
  const css = `
    .paper.receipt { width: 80mm; padding: 6mm 5mm; font-size: 12px; line-height: 1.4; }
    .center { text-align: center; }
    .logo { width: 22mm; height: 22mm; object-fit: contain; margin: 0 auto 4px; display: block; }
    .t-name { font-size: 15px; font-weight: 800; }
    .hr { border-top: 1px dashed #999; margin: 8px 0; }
    .title { font-weight: 800; letter-spacing: .08em; }
    td { padding: 2px 0; vertical-align: top; }
    .item-name { font-weight: 600; }
    .total { font-size: 16px; font-weight: 800; }
    .cancel { border: 2px solid #D93D45; color: #D93D45; font-weight: 800; padding: 4px; text-align: center; margin: 6px 0; }
    .fine { font-size: 10px; color: #555; }
    .vendor { font-size: 9px; margin-top: 8px; flex-wrap: wrap; text-align: center; }
    @media print { @page { size: 80mm auto; margin: 0; } }`;
  const items = sale.items
    .map(
      (i) => `<tr><td colspan="2" class="item-name">${esc(i.name)}</td></tr>
      <tr><td>${i.qty} × ${money(i.unit_price_cents)}</td><td class="num">${money(i.total_cents)}</td></tr>`
    )
    .join('');
  const body = `<div class="paper receipt">
    <div class="center">
      ${tenant.logo ? `<img class="logo" src="${esc(tenant.logo)}" alt="">` : ''}
      <div class="t-name">${esc(tenant.name)}</div>
      ${tenantHeaderLines(tenant).map((l) => `<div>${esc(l)}</div>`).join('')}
    </div>
    <div class="hr"></div>
    <div class="center title">CUPOM DE VENDA</div>
    <div class="center">Nº ${String(sale.number).padStart(6, '0')} · ${fmtDateTime(sale.created_at)}</div>
    <div class="center">Operador: ${esc(sale.user_name || '—')}${sale.customer_name ? ` · Cliente: ${esc(sale.customer_name)}` : ''}</div>
    ${sale.status === 'cancelled' ? `<div class="cancel">VENDA CANCELADA</div>` : ''}
    <div class="hr"></div>
    <table>${items}</table>
    <div class="hr"></div>
    <table>
      <tr><td>Subtotal</td><td class="num">${money(sale.subtotal_cents)}</td></tr>
      ${sale.discount_cents ? `<tr><td>Desconto</td><td class="num">− ${money(sale.discount_cents)}</td></tr>` : ''}
      <tr class="total"><td>TOTAL</td><td class="num">${money(sale.total_cents)}</td></tr>
      <tr><td>Pagamento</td><td class="num">${esc(PAYMENT_LABELS[sale.payment_method] || sale.payment_method)}</td></tr>
      ${sale.payment_method === 'dinheiro' ? `<tr><td>Recebido</td><td class="num">${money(sale.amount_paid_cents)}</td></tr><tr><td>Troco</td><td class="num">${money(sale.change_cents)}</td></tr>` : ''}
    </table>
    <div class="hr"></div>
    ${tenant.doc_footer ? `<div class="center">${esc(tenant.doc_footer)}</div>` : ''}
    <div class="center fine">Documento sem valor fiscal</div>
    ${vendorLine('Sistema')}
  </div>`;
  openWindow(`Cupom ${sale.number} — ${tenant.name}`, css, body, tenant.primary_color);
}

// ---------- Relatório A4 ----------
/** sections: [{ title, html }] — html já escapado pelo chamador. */
export function printReport({ title, subtitle, sections }, tenant) {
  const accent = tenant.primary_color || brand().primaryColor;
  const css = `
    .paper.a4 { width: 210mm; min-height: 297mm; padding: 16mm 15mm 14mm; font-size: 11.5px; display: flex; flex-direction: column; }
    header { display: flex; gap: 14px; align-items: center; padding-bottom: 12px; border-bottom: 3px solid var(--accent); }
    .logo { width: 54px; height: 54px; border-radius: 10px; object-fit: contain; }
    .logo-fallback { width: 54px; height: 54px; border-radius: 10px; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 20px; }
    .t-name { font-size: 18px; font-weight: 800; }
    .t-sub { color: #6A6E86; font-size: 11px; }
    .r-title { margin-left: auto; text-align: right; }
    .r-title h1 { margin: 0; font-size: 17px; }
    .r-title div { color: #6A6E86; }
    main { flex: 1; }
    h2 { font-size: 13px; margin: 20px 0 8px; color: var(--accent); text-transform: uppercase; letter-spacing: .05em; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #E3E5EE; text-align: left; }
    th { background: #F4F5FA; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
    th.num { text-align: right; }
    tfoot td { font-weight: 800; border-top: 2px solid #191830; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
    .kpis div { border: 1px solid #E3E5EE; border-radius: 8px; padding: 8px 10px; }
    .kpis small { display: block; color: #6A6E86; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; }
    .kpis b { font-size: 15px; font-variant-numeric: tabular-nums; }
    footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #E3E5EE; font-size: 9.5px; display: flex; justify-content: space-between; color: #6A6E86; }
    footer .vendor { justify-content: flex-start; }
    @media print { @page { size: A4; margin: 0; } }`;
  const now = new Date();
  const body = `<div class="paper a4">
    <header>
      ${tenant.logo ? `<img class="logo" src="${esc(tenant.logo)}" alt="">` : `<div class="logo-fallback">${esc(initials(tenant.name))}</div>`}
      <div><div class="t-name">${esc(tenant.name)}</div>
        <div class="t-sub">${tenantHeaderLines(tenant).map(esc).join('<br>')}</div></div>
      <div class="r-title"><h1>${esc(title)}</h1><div>${esc(subtitle || '')}</div>
        <div>Emitido em ${fmtDate(todayStr())} às ${now.toTimeString().slice(0, 5)}</div></div>
    </header>
    <main>${sections.map((s) => `${s.title ? `<h2>${esc(s.title)}</h2>` : ''}${s.html}`).join('')}</main>
    <footer>${vendorLine('Relatório gerado pelo')}<span>${esc(tenant.doc_footer || '')}</span></footer>
  </div>`;
  openWindow(`${title} — ${tenant.name}`, css, body, accent);
}
