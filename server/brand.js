// Identidade da fornecedora do software (Kzann Tech).
// Estes são os valores padrão; o painel administrativo Kzann pode sobrescrevê-los
// (armazenados em platform_settings.brand). A identidade de cada adega fica na tabela tenants.
import { db } from './db.js';
import { str, isHexColor, isImageDataUrl, isEmail } from './util.js';

export const DEFAULT_BRAND = Object.freeze({
  vendorName: 'Kzann Tech',
  productName: 'Kzann Tech Adegas',
  slogan: 'Tecnologia que simplifica o seu negócio.',
  audience: 'Adegas, distribuidoras de bebidas e estabelecimentos similares.',
  primaryColor: '#5B3DF5',
  accentColor: '#14C8A8',
  darkColor: '#15122B',
  logoUrl: 'assets/kzann-mark.svg',
  supportEmail: '',
  supportWhatsapp: '',
  website: '',
  trialDays: 14,
});

export function getBrand() {
  const row = db.prepare("SELECT value FROM platform_settings WHERE key = 'brand'").get();
  let overrides = {};
  try {
    overrides = row ? JSON.parse(row.value) : {};
  } catch {}
  return { ...DEFAULT_BRAND, ...overrides };
}

export function updateBrand(input) {
  const current = getBrand();
  const next = { ...current };
  for (const key of ['vendorName', 'productName', 'slogan', 'audience', 'website', 'supportWhatsapp']) {
    if (key in input) next[key] = str(input[key], 160) || DEFAULT_BRAND[key];
  }
  for (const key of ['primaryColor', 'accentColor', 'darkColor']) {
    if (key in input && isHexColor(input[key])) next[key] = input[key];
  }
  if ('supportEmail' in input) next.supportEmail = isEmail(input.supportEmail) ? input.supportEmail : '';
  if ('logoUrl' in input) {
    const v = input.logoUrl;
    next.logoUrl = isImageDataUrl(v) && v.length < 700_000 ? v : DEFAULT_BRAND.logoUrl;
  }
  if ('trialDays' in input) {
    const n = Number(input.trialDays);
    next.trialDays = Number.isInteger(n) && n >= 0 && n <= 90 ? n : DEFAULT_BRAND.trialDays;
  }
  db.prepare(
    "INSERT INTO platform_settings (key, value) VALUES ('brand', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(JSON.stringify(next));
  return next;
}
