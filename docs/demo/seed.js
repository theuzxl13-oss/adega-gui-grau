// Dados iniciais: planos, usuário administrador Kzann Tech e uma adega de demonstração.
import { db, tx } from './db.js';
import { hashPassword } from './auth.js';
import { createTenantWithOwner } from './services.js';
import { localStamp, today, addDays } from './util.js';

export const DEMO = {
  admin: { email: 'admin@kzann.tech', password: globalThis.process?.env?.ADMIN_PASSWORD || 'kzann-admin-2026' },
  owner: { email: 'dono@adegaexemplo.com.br', password: 'adega-demo-2026' },
  cashier: { email: 'caixa@adegaexemplo.com.br', password: 'caixa-demo-2026' },
};

const PLANS = [
  {
    name: 'Essencial', description: 'Para a adega que está começando a se organizar.', price: 7990,
    users: 2, products: 300, sort: 1, highlighted: 0,
    features: ['PDV rápido com leitor de código de barras', 'Controle de estoque', 'Relatórios de vendas', 'Até 2 usuários'],
  },
  {
    name: 'Profissional', description: 'O mais escolhido por adegas e distribuidoras.', price: 12990,
    users: 6, products: 3000, sort: 2, highlighted: 1,
    features: ['Tudo do Essencial', 'Até 6 usuários com permissões', 'Lucro bruto e ranking de produtos', 'Sua marca nos documentos', 'Suporte prioritário'],
  },
  {
    name: 'Rede', description: 'Para distribuidoras e operações com alto volume.', price: 24990,
    users: 0, products: 0, sort: 3, highlighted: 0,
    features: ['Tudo do Profissional', 'Usuários e produtos ilimitados', 'Relatórios por operador', 'Acompanhamento dedicado'],
  },
];

// [categoria, nome, código de barras, custo, preço, estoque, mínimo]
const PRODUCTS = [
  ['Cervejas', 'Cerveja Pilsen Lata 350ml', '7890000000011', 289, 499, 240, 48],
  ['Cervejas', 'Cerveja Puro Malte Lata 350ml', '7890000000028', 359, 599, 180, 48],
  ['Cervejas', 'Cerveja Puro Malte Long Neck 330ml', '7890000000035', 489, 799, 96, 24],
  ['Cervejas', 'Cerveja Pilsen Garrafa 600ml', '7890000000042', 649, 1099, 60, 24],
  ['Cervejas', 'Cerveja IPA Artesanal 500ml', '7890000000059', 1290, 2190, 18, 12],
  ['Vinhos', 'Vinho Tinto Seco Cabernet 750ml', '7890000000066', 2490, 4490, 30, 10],
  ['Vinhos', 'Vinho Branco Suave 750ml', '7890000000073', 1890, 3490, 22, 8],
  ['Vinhos', 'Espumante Brut 750ml', '7890000000080', 3290, 5990, 12, 6],
  ['Destilados', 'Vodka Tradicional 1L', '7890000000097', 2290, 3990, 25, 8],
  ['Destilados', 'Gin London Dry 750ml', '7890000000103', 5490, 8990, 9, 6],
  ['Destilados', 'Whisky 8 Anos 1L', '7890000000110', 7990, 12990, 7, 4],
  ['Destilados', 'Cachaça Ouro 700ml', '7890000000127', 1490, 2690, 20, 6],
  ['Refrigerantes e Águas', 'Refrigerante Cola 2L', '7890000000134', 699, 1099, 48, 12],
  ['Refrigerantes e Águas', 'Refrigerante Guaraná 2L', '7890000000141', 589, 949, 40, 12],
  ['Refrigerantes e Águas', 'Água Mineral sem Gás 500ml', '7890000000158', 99, 300, 120, 24],
  ['Refrigerantes e Águas', 'Água Tônica Lata 350ml', '7890000000165', 249, 499, 36, 12],
  ['Energéticos', 'Energético Lata 473ml', '7890000000172', 549, 999, 64, 24],
  ['Energéticos', 'Energético 2L', '7890000000189', 1190, 1990, 14, 6],
  ['Conveniência', 'Gelo em Cubos 5kg', '7890000000196', 590, 1290, 30, 10],
  ['Conveniência', 'Carvão Vegetal 3kg', '7890000000202', 990, 1990, 15, 5],
  ['Conveniência', 'Copo Descartável 300ml (50 un.)', '7890000000219', 450, 890, 4, 10],
  ['Conveniência', 'Amendoim Torrado 150g', '7890000000226', 290, 650, 3, 10],
];

/** Gerador pseudoaleatório determinístico para dados de demonstração estáveis. */
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) n FROM plans').get().n) return false;
  tx(() => {
    const now = localStamp();
    const planIds = PLANS.map((p) =>
      Number(
        db
          .prepare(
            `INSERT INTO plans (name, description, price_cents, max_users, max_products, features, highlighted, sort)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(p.name, p.description, p.price, p.users, p.products, JSON.stringify(p.features), p.highlighted, p.sort)
          .lastInsertRowid
      )
    );

    db.prepare(
      "INSERT INTO users (tenant_id, name, email, password_hash, role, created_at) VALUES (NULL, ?, ?, ?, 'superadmin', ?)"
    ).run('Equipe Kzann Tech', DEMO.admin.email, hashPassword(DEMO.admin.password), now);

    const tenantId = createTenantWithOwner({
      tenantName: 'Adega Exemplo',
      ownerName: 'Proprietário Demo',
      email: DEMO.owner.email,
      password: DEMO.owner.password,
      planId: planIds[1],
      status: 'active',
    });
    db.prepare(
      `UPDATE tenants SET legal_name = ?, cnpj = ?, phone = ?, address = ?, city = ?, primary_color = ?, doc_footer = ?
       WHERE id = ?`
    ).run(
      'Adega Exemplo Comércio de Bebidas Ltda.',
      '00.000.000/0001-00',
      '(11) 90000-0000',
      'Rua Exemplo, 123 — Centro',
      'São Paulo/SP',
      '#7A1F3D',
      'Obrigado pela preferência! Beba com moderação. Venda proibida para menores de 18 anos.',
      tenantId
    );
    db.prepare(
      "INSERT INTO users (tenant_id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'cashier', ?)"
    ).run(tenantId, 'Operador de Caixa', DEMO.cashier.email, hashPassword(DEMO.cashier.password), now);
    const ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO.owner.email).id;
    const cashierId = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO.cashier.email).id;

    const cats = Object.fromEntries(
      db.prepare('SELECT id, name FROM categories WHERE tenant_id = ?').all(tenantId).map((c) => [c.name, c.id])
    );
    const products = PRODUCTS.map(([cat, name, barcode, cost, price, stock, min]) => {
      const id = Number(
        db
          .prepare(
            `INSERT INTO products (tenant_id, category_id, name, barcode, cost_cents, price_cents, stock, min_stock, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(tenantId, cats[cat], name, barcode, cost, price, stock, min, now).lastInsertRowid
      );
      return { id, name, cost, price };
    });

    // Histórico de 45 dias de vendas (não altera o estoque atual, apenas alimenta os relatórios).
    const rand = rng(42);
    const methods = ['pix', 'pix', 'pix', 'dinheiro', 'debito', 'debito', 'credito'];
    let number = 0;
    for (let back = 45; back >= 0; back--) {
      const day = addDays(today(), -back);
      const weekday = new Date(`${day}T12:00:00`).getDay();
      const base = weekday === 5 || weekday === 6 ? 22 : weekday === 0 ? 16 : 10;
      const count = back === 0 ? 6 : base + Math.floor(rand() * 8);
      for (let i = 0; i < count; i++) {
        const hour = 10 + Math.floor(rand() * 13);
        const stamp = `${day} ${String(hour).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00`;
        if (back === 0 && stamp > now) continue;
        const lines = new Map();
        const n = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const p = products[Math.floor(Math.pow(rand(), 1.6) * products.length)];
          lines.set(p, (lines.get(p) || 0) + 1 + Math.floor(rand() * (p.price < 1000 ? 6 : 2)));
        }
        let subtotal = 0;
        for (const [p, q] of lines) subtotal += p.price * q;
        const discount = rand() < 0.1 ? Math.round(subtotal * 0.05) : 0;
        const total = subtotal - discount;
        const method = methods[Math.floor(rand() * methods.length)];
        const paid = method === 'dinheiro' ? Math.ceil(total / 1000) * 1000 : total;
        const cancelled = rand() < 0.02;
        const saleId = Number(
          db
            .prepare(
              `INSERT INTO sales (tenant_id, number, user_id, subtotal_cents, discount_cents, total_cents, payment_method,
                 amount_paid_cents, change_cents, status, cancel_reason, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              tenantId, ++number, rand() < 0.7 ? cashierId : ownerId, subtotal, discount, total, method,
              paid, paid - total, cancelled ? 'cancelled' : 'completed', cancelled ? 'Erro de digitação' : '', stamp
            ).lastInsertRowid
        );
        for (const [p, q] of lines) {
          db.prepare(
            `INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price_cents, cost_cents, total_cents)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(saleId, p.id, p.name, q, p.price, p.cost, p.price * q);
        }
      }
    }

    // Uma adega em período de teste, para o painel administrativo ter variedade.
    createTenantWithOwner({
      tenantName: 'Distribuidora Modelo',
      ownerName: 'Responsável Modelo',
      email: 'contato@distribuidoramodelo.com.br',
      password: 'distribuidora-demo-2026',
      planId: planIds[0],
      status: 'trial',
    });
  });
  return true;
}
