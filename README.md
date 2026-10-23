# Kzann Tech Adegas

**Tecnologia que simplifica o seu negócio.**

SaaS multiempresa por assinatura para adegas, distribuidoras de bebidas e estabelecimentos similares.
A **Kzann Tech** é a marca fornecedora do software; cada adega tem seu próprio nome, logotipo e cor na interface e nos documentos.

## Demonstração (GitHub Pages)

A pasta `docs/` contém uma versão estática que roda **inteira no navegador**: a mesma API do servidor é executada
no próprio navegador com SQLite em WebAssembly ([sql.js](https://github.com/sql-js/sql.js)), e os dados ficam salvos
apenas no navegador de quem está testando. Na tela de login há atalhos para entrar como:

| Perfil | O que vê |
| --- | --- |
| Dono da adega | Painel, PDV, produtos/estoque, vendas, relatórios e configurações (identidade visual, usuários) |
| Operador de caixa | PDV e as próprias vendas |
| Admin Kzann Tech | Painel da plataforma: adegas assinantes, planos, MRR e marca Kzann Tech |

O botão **Restaurar dados de demonstração** volta tudo ao estado inicial.

> A demonstração não tem segurança real (senhas e tokens ficam no navegador). Para uso em produção, hospede o servidor Node.

## Rodando o servidor de verdade

Requisitos: **Node.js 22.13 ou superior** (usa o SQLite nativo `node:sqlite`; não há dependências para instalar).

### Produção

Na primeira execução o banco `data/kzann.db` é criado só com os planos padrão. **Nenhuma conta é criada sem
credenciais explícitas**: defina o administrador Kzann Tech pelas variáveis de ambiente e inicie com `npm start`.

| Variável | Uso |
| --- | --- |
| `ADMIN_EMAIL` | E-mail do administrador Kzann Tech, criado no primeiro start se ainda não houver nenhum |
| `ADMIN_PASSWORD` | Senha desse administrador (mínimo de 12 caracteres). Depois de criado, remova a variável |
| `APP_SECRET` | Segredo para assinar os tokens de sessão (padrão: gerado em `data/.secret`) |
| `PORT` | Porta HTTP (padrão 3000) |
| `DATA_DIR` | Pasta do banco de dados (padrão `data/`) |
| `KZ_DEMO_DATA` | `1` cria os dados de demonstração (o mesmo que `--demo`). **Nunca use em produção** |

Se o banco tiver contas de demonstração (senhas públicas), o servidor mostra um alerta no start.

### Desenvolvimento

```bash
npm run dev:demo       # servidor com dados de demonstração; as senhas aparecem no terminal
npm run reset          # apaga o banco local e recria os dados de demonstração
npm run build:pages    # gera a demonstração estática em docs/
npm run preview:pages  # serve docs/ em http://localhost:4000 para testar
```

## Arquitetura

```
server/
  index.js        servidor HTTP (arquivos estáticos + /api)
  api.js          despacho da API e autenticação (usado também pela demonstração)
  routes/         public (login, cadastro, planos) · tenant (identidade, usuários)
                  catalog (produtos, categorias, estoque) · sales (PDV, painel, relatórios) · admin (Kzann Tech)
  brand.js        marca Kzann Tech (padrões + personalização pelo painel admin)
  services.js     regras de assinatura, limites de plano, criação de adegas
  schema.js       tabelas SQLite · seed.js dados iniciais
demo/             db.js (sql.js) e auth.js usados no lugar dos do servidor na demonstração
public/
  index.html      página comercial · login.html entrar/cadastro
  app.html        sistema da adega · admin.html painel Kzann Tech
  js/docs.js      cupom de venda (80 mm) e relatórios A4/PDF com a identidade da adega
  css/kzann.css   design system (tokens de cor da marca)
```

### Multiempresa e assinatura

- Cada adega é um *tenant*; todas as consultas filtram por `tenant_id` do usuário autenticado.
- Status da assinatura: `trial` (teste grátis), `active`, `suspended`, `cancelled`. Teste vencido ou suspensão
  bloqueiam o uso (HTTP 402), mantendo o acesso às configurações.
- Planos definem preço e limites de usuários/produtos (0 = ilimitado), editáveis no painel Kzann Tech.

### Identidade visual

- **Marca Kzann Tech** (nome, slogan, cores, logotipo, contatos, dias de teste): painel admin → *Marca*. Aparece na
  página comercial, login, rodapé do menu e assinatura dos documentos.
- **Marca da adega** (nome fantasia, razão social, CNPJ, endereço, logotipo, cor, mensagem de rodapé): sistema da
  adega → *Configurações*. Aparece no menu, nos botões da interface, no cupom e nos relatórios.

### Perfis de acesso

`owner` (proprietário) · `manager` (gerente) · `cashier` (caixa) · `superadmin` (equipe Kzann Tech).

### Descontos

O caixa pode conceder até **10% do subtotal** sozinho. Acima disso, a venda só é concluída com o e-mail e a senha
de um gerente ou do dono da mesma adega, e o sistema registra quem autorizou (`sales.discount_authorized_by`).
Gerente e dono não têm limite e ficam registrados como autorizadores dos próprios descontos acima de 10%.
A regra é aplicada no servidor (`server/services.js`, `authorizeDiscount`).

## Observações

- O cupom de venda é um comprovante **não fiscal**. Emissão de NFC-e exige integração com um emissor credenciado.
- Os dados de demonstração (produtos, CNPJ, endereços) são fictícios.

© Kzann Tech
