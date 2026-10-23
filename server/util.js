// Helpers de data (horário local do servidor) e validação de entrada.

const pad = (n) => String(n).padStart(2, '0');

export function localStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const today = () => localStamp().slice(0, 10);

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return localStamp(dt).slice(0, 10);
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Converte período (datas inclusivas) em limites [início, fim) para a coluna created_at. */
export function dateRange(from, to) {
  const f = isDate(from) ? from : today();
  const t = isDate(to) ? to : f;
  return { from: f, to: t, start: `${f} 00:00:00`, end: `${addDays(t, 1)} 00:00:00` };
}

export function str(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '';
}

export function int(v, { min = -Infinity, max = Infinity, def = null } = {}) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const isHexColor = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
export const isImageDataUrl = (s) =>
  typeof s === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s);
