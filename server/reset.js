// Apaga o banco local e recria os dados de DEMONSTRAÇÃO (senhas públicas). Uso apenas em desenvolvimento.
import fs from 'node:fs';
import { DB_FILE } from './paths.js';

for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_FILE + suffix, { force: true });
const { seedPlans, seedDemo } = await import('./seed.js');
seedPlans();
seedDemo();
console.log('Banco recriado com dados de demonstração. Inicie com `npm run dev:demo`.');
