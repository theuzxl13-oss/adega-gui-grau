import { api, session, loadPublicBrand, formValues, withBusy, money, esc, applyPrimary, DEMO_MODE } from './core.js';

const b = await loadPublicBrand();
applyPrimary();
document.getElementById('year').textContent = new Date().getFullYear();
document.getElementById('trial').textContent = b.trialDays ?? 14;

const params = new URLSearchParams(location.search);
const show = (mode) => {
  document.getElementById('login').classList.toggle('hidden', mode !== 'login');
  document.getElementById('signup').classList.toggle('hidden', mode !== 'signup');
  document.title = `${mode === 'login' ? 'Entrar' : 'Criar conta'} — ${b.productName}`;
};
show(params.get('modo') === 'cadastro' ? 'signup' : 'login');
document.querySelectorAll('[data-mode]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    show(a.dataset.mode);
    history.replaceState(null, '', a.dataset.mode === 'signup' ? '?modo=cadastro' : 'login.html');
  })
);
if (params.get('expirou')) {
  document.getElementById('notice').innerHTML = '<div class="banner warning" style="margin-bottom:14px">Sua sessão expirou. Entre novamente.</div>';
}

const goHome = (user) => (location.href = user.role === 'superadmin' ? 'admin.html' : 'app.html');

// Já autenticado? Vai direto para o painel.
if (session.get()) {
  api('/api/auth/me').then(({ user }) => goHome(user)).catch(() => session.clear());
}

const loginForm = document.getElementById('login-form');
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  withBusy(e.submitter, async () => {
    const res = await api('/api/auth/login', { method: 'POST', body: formValues(e.target) });
    session.set(res.token);
    goHome(res.user);
  }).catch(() => {});
});

document.getElementById('signup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const body = formValues(e.target);
  body.plan_id = Number(body.plan_id);
  withBusy(e.submitter, async () => {
    const res = await api('/api/public/signup', { method: 'POST', body });
    session.set(res.token);
    location.href = 'app.html#/configuracoes';
  }).catch(() => {});
});

api('/api/public/plans')
  .then((plans) => {
    const wanted = Number(params.get('plano'));
    document.getElementById('plan-select').innerHTML = plans
      .map((p) => `<option value="${p.id}" ${p.id === wanted || (!wanted && p.highlighted) ? 'selected' : ''}>${esc(p.name)} — ${money(p.price_cents)}/mês</option>`)
      .join('');
  })
  .catch(() => {});

// Atalhos de acesso na versão de demonstração.
if (DEMO_MODE) {
  const { DEMO } = await import('../demo/seed.js');
  const box = document.getElementById('demo');
  box.classList.remove('hidden');
  box.innerHTML = `<b>Versão de demonstração</b>
    <p class="muted small">Os dados ficam salvos apenas neste navegador. Escolha um perfil para entrar:</p>
    <div class="row wrap">
      <button class="btn btn-sm" data-demo="owner">Dono da adega</button>
      <button class="btn btn-sm" data-demo="cashier">Operador de caixa</button>
      <button class="btn btn-sm" data-demo="admin">Admin Kzann Tech</button>
    </div>
    <button class="btn btn-sm btn-ghost" id="demo-reset" style="margin-top:8px">Restaurar dados de demonstração</button>`;
  box.querySelector('#demo-reset').addEventListener('click', async () => {
    const { resetDemo } = await import('../demo/server.js');
    resetDemo();
    session.clear();
    location.reload();
  });
  box.querySelectorAll('[data-demo]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const cred = DEMO[btn.dataset.demo];
      loginForm.email.value = cred.email;
      loginForm.password.value = cred.password;
      loginForm.requestSubmit();
    })
  );
}
