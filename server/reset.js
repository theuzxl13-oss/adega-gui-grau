// Apaga o banco local e recria os dados de demonstração.
import fs from 'node:fs';
import { DB_FILE } from './paths.js';

for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_FILE + suffix, { force: true });
const { seedIfEmpty } = await import('./seed.js');
seedIfEmpty();
console.log('Banco recriado com dados de demonstração.');
