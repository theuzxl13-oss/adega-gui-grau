import { api, loadPublicBrand, money, esc, icon } from './core.js';

const b = await loadPublicBrand();
document.title = `${b.productName} — ${b.slogan}`;
document.getElementById('year').textContent = new Date().getFullYear();
document.getElementById('trial-days').textContent = b.trialDays ?? 14;
document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));

const contact = [b.supportEmail && `<a href="mailto:${esc(b.supportEmail)}">${esc(b.supportEmail)}</a>`,
  b.supportWhatsapp && `WhatsApp ${esc(b.supportWhatsapp)}`].filter(Boolean);
document.getElementById('contact').innerHTML = contact.join(' · ');

try {
  const plans = await api('/api/public/plans');
  document.getElementById('plans').innerHTML = plans
    .map(
      (p) => `<div class="plan ${p.highlighted ? 'hl' : ''}">
        ${p.highlighted ? '<span class="tagline">Mais escolhido</span>' : ''}
        <h3>${esc(p.name)}</h3>
        <p class="muted">${esc(p.description)}</p>
        <div class="price">${money(p.price_cents)}<small> /mês</small></div>
        <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <a class="btn btn-lg btn-block" href="login.html?modo=cadastro&plano=${p.id}">Testar o ${esc(p.name)}</a>
      </div>`
    )
    .join('');
} catch {
  document.getElementById('plans').innerHTML = '<p class="muted">Não foi possível carregar os planos agora.</p>';
}
