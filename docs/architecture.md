# MarketPilot AI — arquitetura

Decisão em 07/11/2026: monorepo modular com processos separados para web, API e, futuramente, worker. O diretório pai contém outros projetos, sem repositório MarketPilot nem AGENTS.md aplicável. Nenhum projeto existente será alterado.

## Alternativas consideradas

1. **Monorepo com API separada (escolhida):** permite executar filas e agentes fora do Next.js, compartilhar contratos e limitar recursos por serviço. Acrescenta um processo local.
2. Next.js com todo o backend em route handlers: menos processos no início, mas acopla operações longas ao frontend.
3. Microsserviços por agente: isolamento maior, custo operacional excessivo para esta fase e uma VPS compartilhada.

## Limites e fluxo

Navegador → Next.js `/api/*` (mesma origem) → Fastify → Prisma → PostgreSQL.

- `apps/web`: App Router, componentes acessíveis, temas, dashboard e páginas de preparação.
- `apps/api`: validação Zod, sessão opaca, autorização, auditoria e agregação do dashboard.
- `packages/contracts`: esquemas e tipos públicos; nunca contém segredos.
- `packages/database`: schema Prisma, migrações e uma instância de cliente por processo.
- `tests`: regras unitárias, integração HTTP com PostgreSQL e navegação E2E.
- Fases 3–5: worker BullMQ/Redis, adaptadores oficiais e n8n. Nenhum desses serviços é anunciado como conectado nesta fase.

## Segurança e dados

Senhas recebem scrypt com salt aleatório. O navegador guarda somente cookie HttpOnly, SameSite=Lax e Secure em produção. O banco recebe hash SHA-256 do token de sessão, nunca o token original. Sessões expiram e são revogadas no logout. Toda leitura privada exige sessão e escopo do workspace. Alterações de configuração exigem ADMIN. Escritas exigem Origin igual a APP_ORIGIN. Rate limit em memória atende uma réplica da API nesta fase; Redis é necessário antes de escalar.

Cadastro cria workspace isolado. Em produção, cadastro aberto fica desabilitado por padrão. Verificação de e-mail, recuperação de senha, MFA e convites não pertencem à entrega inicial e são requisitos anteriores ao lançamento público.

`/v1/demo/*` consulta fixtures imutáveis, sem persistência ou operações externas. `/v1/dashboard` consulta a conta e retorna estado vazio até as integrações das fases seguintes. Os tipos identificam dados `simulated`, `estimated` e `real`. A demonstração é identificada permanentemente; não há fallback silencioso de dados reais para fictícios.

Falha de banco responde 503 para serviços privados. Health de processo e readiness de banco são separados. Logs estruturados removem cookies, senhas e autorização. n8n não será dependência de disponibilidade da API.

## Fase 1 e critérios

Inclui identidade, dark/light, sidebar retrátil e responsiva, login/cadastro/logout persistentes, autorização, dashboard com filtros de 7/30/90 dias, gráfico, ranking, atividades, CSV demonstrativo, configurações básicas e navegação de preparação das 18 áreas. O centro de operações inicial apresenta agentes aguardando configuração ou simulação estática; execução e feed em tempo real ficam na Fase 4.

Validação: lint sem avisos, TypeScript estrito, testes de sessão/isolamento/agregação, integração sobre PostgreSQL e build de produção. E2E cobre demo, autenticação, navegação, tema e layout móvel.

Fase 2 recebe o catálogo de produtos/fornecedores e importação. O banco da Fase 1 armazena apenas identidade, workspaces, sessões, preferências e auditoria; não antecipa o modelo comercial completo.

Deploy remoto/Hostinger/Coolify fica para a Fase 7. A configuração local não acessa nem altera a VPS.

## Evolução na Fase 2

O catálogo fica em `apps/api/src/catalog` (parser, serviço transacional e rotas) e `apps/web/src/components/catalog` (consulta, formulários, prévia e histórico). Contratos públicos continuam em `packages/contracts`; não há dependência do frontend em código de servidor.

Supplier, Product, CatalogImport e CostSnapshot usam workspace da sessão. Chaves compostas no banco impedem relações de catálogo entre workspaces. CRUD usa arquivamento, versões otimistas e auditoria. Importações validadas usam transação serializável, inserções em lote e hash idempotente; arquivos não são persistidos. O dashboard mantém finanças sem dados fictícios e passa a consultar o resumo real de produtos.

Não há chamadas externas. A demonstração mantém o catálogo na memória do QueryClient e compartilha apenas o parser limitado, sem escrita no banco. Consulte `docs/catalog-format.md` para o contrato dos arquivos e `docs/phase-2.md` para o estado da entrega.

## Referências técnicas

- [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation)
- [Prisma 7 e adaptador PostgreSQL](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction)
- [Prisma Postgres local](https://www.prisma.io/docs/local-development/postgres)
- [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
