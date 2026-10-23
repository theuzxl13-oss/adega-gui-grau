// Kzann Tech Adegas — servidor HTTP (API + arquivos estáticos).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR } from './paths.js';
import { HttpError, readJson, sendJson } from './http.js';
import { dispatch } from './api.js';
import { getBrand } from './brand.js';
import { seedIfEmpty, DEMO } from './seed.js';

const PORT = Number(process.env.PORT) || 3000;

async function handleApi(req, res, url) {
  let body = {};
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      body = await readJson(req);
    } catch (err) {
      return sendJson(res, err instanceof HttpError ? err.status : 400, { error: err.message });
    }
  }
  const { status, data } = await dispatch({
    method: req.method,
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
    authorization: req.headers.authorization || '',
    req,
  });
  sendJson(res, status, data);
}

const PAGES = {
  '/': 'index.html',
  '/entrar': 'login.html',
  '/cadastro': 'login.html',
  '/app': 'app.html',
  '/admin': 'admin.html',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, url) {
  let rel = PAGES[url.pathname.replace(/\/+$/, '') || '/'];
  if (!rel) {
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      rel = '';
    }
  }
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(PUBLIC_DIR, '404.html')).pipe(res);
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Powered-By', 'Kzann Tech');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  serveStatic(req, res, url);
});

const seeded = seedIfEmpty();
server.listen(PORT, () => {
  const brand = getBrand();
  console.log(`\n  ${brand.productName} — ${brand.slogan}`);
  console.log(`  Servidor em http://localhost:${PORT}\n`);
  if (seeded) {
    console.log('  Dados de demonstração criados:');
    console.log(`    Admin Kzann Tech:  ${DEMO.admin.email} / ${DEMO.admin.password}`);
    console.log(`    Dono da adega:     ${DEMO.owner.email} / ${DEMO.owner.password}`);
    console.log(`    Operador de caixa: ${DEMO.cashier.email} / ${DEMO.cashier.password}\n`);
  }
});
