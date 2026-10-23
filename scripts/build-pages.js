// Gera a versão de demonstração estática (GitHub Pages) em docs/.
// O front-end é o mesmo; a API do servidor é copiada para docs/demo/ e roda no navegador,
// trocando apenas db.js (sql.js) e auth.js pelas versões em demo/.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/paths.js';

const OUT = path.join(ROOT, 'docs');
const SHARED = ['api.js', 'brand.js', 'services.js', 'util.js', 'http.js', 'seed.js', 'schema.js'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'js', 'runtime.js'),
  '// Gerado por scripts/build-pages.js — versão de demonstração estática.\nexport const DEMO_MODE = true;\n'
);

const demoOut = path.join(OUT, 'demo');
fs.mkdirSync(path.join(demoOut, 'routes'), { recursive: true });
for (const f of SHARED) fs.copyFileSync(path.join(ROOT, 'server', f), path.join(demoOut, f));
for (const f of fs.readdirSync(path.join(ROOT, 'server', 'routes'))) {
  fs.copyFileSync(path.join(ROOT, 'server', 'routes', f), path.join(demoOut, 'routes', f));
}
for (const f of fs.readdirSync(path.join(ROOT, 'demo'))) {
  fs.copyFileSync(path.join(ROOT, 'demo', f), path.join(demoOut, f));
}
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Demonstração estática gerada em docs/');
