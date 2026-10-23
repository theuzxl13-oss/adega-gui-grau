// Kzann Tech Adegas — utilitários compartilhados do front-end.
import { DEMO_MODE } from './runtime.js';

export { DEMO_MODE };

export const DEFAULT_BRAND = {
  vendorName: 'Kzann Tech',
  productName: 'Kzann Tech Adegas',
  slogan: 'Tecnologia que simplifica o seu negócio.',
  primaryColor: '#5B3DF5',
  accentColor: '#14C8A8',
  darkColor: '#15122B',
  logoUrl: 'assets/kzann-mark.svg',
};

export const PAYMENT_LABELS = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito', outro: 'Outro' };
export const ROLE_LABELS = { owner: 'Proprietário', manager: 'Gerente', cashier: 'Caixa', superadmin: 'Admin Kzann' };
export const STATUS_LABELS = { trial: 'Em teste', active: 'Ativa', suspended: 'Suspensa', cancelled: 'Cancelada' };

// ---------- Sessão ----------
const TOKEN_KEY = 'kz_token';
export const session = {
  get() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch {} },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch {} },
};

export function logout() {
  session.clear();
  location.href = 'login.html';
}

// ---------- API ----------
// No modo demonstração (GitHub Pages) o mesmo back-end roda dentro do navegador.
async function request(path, method, body, token) {
  if (DEMO_MODE) {
    const { demoRequest } = await import('../demo/server.js');
    return demoRequest(path, { method, body, token });
  }
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error('Sem conexão com o servidor.'), { status: 0 });
  }
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = session.get();
  const { status, data } = await request(path, method, body, token);
  if (status === 401 && token) {
    session.clear();
    location.href = 'login.html?expirou=1';
  }
  if (status >= 400) throw Object.assign(new Error(data.error || 'Erro inesperado.'), { status });
  return data;
}

// ---------- Formatação ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (cents) => brl.format((Number(cents) || 0) / 100);
export const num = (n) => (Number(n) || 0).toLocaleString('pt-BR');

/** "12,50" | "12.5" | "1.234,56" → centavos */
export function parseMoney(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  let s = String(v || '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export const centsToInput = (c) => ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');

export function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export const fmtDateTime = (s) => (s ? `${fmtDate(s)} ${s.slice(11, 16)}` : '—');

export function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// ---------- Marca / tema ----------
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const textOn = (hex) => (/^#[0-9a-f]{6}$/i.test(hex) && luminance(hex) > 0.45 ? '#15122B' : '#FFFFFF');

let currentBrand = { ...DEFAULT_BRAND };
export const brand = () => currentBrand;

/** Aplica a marca Kzann Tech (fornecedora) em toda a página. */
export function applyBrand(b) {
  currentBrand = { ...DEFAULT_BRAND, ...b };
  const root = document.documentElement.style;
  root.setProperty('--kz-primary', currentBrand.primaryColor);
  root.setProperty('--kz-accent', currentBrand.accentColor);
  root.setProperty('--kz-dark', currentBrand.darkColor);
  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.rel = 'icon';
    document.head.appendChild(icon);
  }
  icon.href = currentBrand.logoUrl;
  document.querySelectorAll('[data-brand]').forEach((el) => {
    const key = el.dataset.brand;
    if (key === 'logo') el.src = currentBrand.logoUrl;
    else if (currentBrand[key]) el.textContent = currentBrand[key];
  });
  return currentBrand;
}

/** Cor de destaque da interface: a da adega quando configurada, senão a da Kzann Tech. */
export function applyPrimary(color) {
  const c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : currentBrand.primaryColor;
  document.documentElement.style.setProperty('--primary', c);
  document.documentElement.style.setProperty('--on-primary', textOn(c));
}

export async function loadPublicBrand() {
  try {
    return applyBrand(await api('/api/public/brand'));
  } catch {
    return applyBrand({});
  }
}

export function tenantLogoHtml(tenant, size = 42) {
  const style = `width:${size}px;height:${size}px`;
  return tenant?.logo
    ? `<div class="tenant-logo" style="${style}"><img src="${esc(tenant.logo)}" alt=""></div>`
    : `<div class="tenant-logo" style="${style}">${esc(initials(tenant?.name))}</div>`;
}

// ---------- Ícones (traço 2px, 24x24) ----------
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3h2.6l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 7H6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15v2M11 11v6M15 7v10M19 12v5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z"/><circle cx="7" cy="7" r="1.5"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1 0 1.6-.8 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2A5.5 5.5 0 0 0 22 11c0-5-4.5-9-10-9Z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  arrows: '<path d="M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- Toast e modal ----------
export function toast(message, type = '') {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 3000);
}

/** Abre um modal. body/foot são HTML. Retorna { el, close }. */
export function openModal({ title, body, foot = '', wide = false, onClose }) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="btn btn-ghost icon-btn" data-close aria-label="Fechar">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  back.addEventListener('mousedown', (e) => e.target === back && close());
  back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  setTimeout(() => back.querySelector('input:not([type=hidden]), select, textarea')?.focus(), 30);
  return { el: back, close };
}

export function confirmDialog(message, { title = 'Confirmar', ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      body: `<p>${esc(message)}</p>`,
      foot: `<button class="btn" data-close>Voltar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>`,
      onClose: () => !answered && resolve(false),
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => {
      answered = true;
      m.close();
      resolve(true);
    });
  });
}

export const formValues = (form) => Object.fromEntries(new FormData(form).entries());

/** Envia o formulário com estado de carregamento e mensagem de erro. */
export async function withBusy(button, fn) {
  const label = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = 'Aguarde…';
  }
  try {
    return await fn();
  } catch (err) {
    toast(err.message, 'error');
    throw err;
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = label;
    }
  }
}

/** Lê um arquivo de imagem como data URL, reduzindo imagens grandes para no máximo 512px. */
export function imageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return reject(new Error('Use uma imagem PNG, JPG, WEBP ou SVG.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = () => {
      const url = reader.result;
      if (file.type === 'image/svg+xml') {
        return url.length > 600_000 ? reject(new Error('SVG muito grande.')) : resolve(url);
      }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 512 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.src = url;
    };
    reader.readAsDataURL(file);
  });
}

/** Gráfico de barras simples em HTML. rows: [{label, value, title, highlight}] */
export function barsHtml(rows, fmt = money) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="bars">${rows
    .map(
      (r) => `<div class="bar ${r.highlight ? 'today' : ''}" title="${esc(r.title || r.label)}: ${esc(fmt(r.value))}">
        <div class="track"><span class="fill" style="height:${Math.max(1, (r.value / max) * 100)}%"></span></div><small>${esc(r.label)}</small></div>`
    )
    .join('')}</div>`;
}
