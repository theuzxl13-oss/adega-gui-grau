// Ponto de entrada da demonstração: executa a mesma API do servidor dentro do navegador.
import { dispatch } from './api.js';
import { persist, STORAGE_KEY } from './db.js';
import { seedIfEmpty } from './seed.js';

if (seedIfEmpty()) persist();

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export async function demoRequest(path, { method = 'GET', body, token }) {
  const url = new URL(path, 'http://demo.local');
  const res = await dispatch({
    method,
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body: clone(body) || {},
    authorization: token ? `Bearer ${token}` : '',
    req: { socket: { remoteAddress: 'demo' } },
  });
  if (method !== 'GET') persist();
  return { status: res.status, data: clone(res.data) };
}

export function resetDemo() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
