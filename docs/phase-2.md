# Fase 2 — catálogo operacional

Implementação incremental sobre a Fase 1, mantendo Next.js/Fastify/Prisma, autenticação, workspaces e identidade oficial.

## Entrega

- Fornecedores persistentes: cadastro, edição, arquivamento/reativação, CNPJ opcional, contatos, referência, condições logísticas, avaliação interna e observações.
- Produtos persistentes: SKU por fornecedor, categoria, custo e frete em centavos, estoque, prazo, origem, data e histórico de custo/disponibilidade.
- Importação CSV/XML com prévia, declaração de autorização, validação por linha, limites, transação e prevenção de reprocessamento por hash.
- Busca e paginação no servidor; filtros por status e fornecedor; controle de versão para edições concorrentes.
- Auditoria e autorização por workspace; VIEWER consulta sem alterar.
- Demonstração com fornecedores e produtos fictícios, editáveis apenas na memória; recarregar restaura os dados.
- Nenhuma conexão externa, sincronização automática, precificação com IA ou publicação de anúncios foi iniciada.

## Migração

`202611070002_catalog` adiciona Supplier, Product, CatalogImport e CostSnapshot. Chaves compostas garantem que produtos e importações pertençam ao mesmo workspace do fornecedor; snapshots pertencem ao workspace do produto. A migração preserva os dados da Fase 1. Execute `npm run db:generate` e `npm run db:migrate` antes de iniciar a nova versão.

Arquivamento preserva histórico. Arquivar fornecedor não arquiva seus produtos automaticamente; a interface identifica o vínculo com fornecedor arquivado e bloqueia edição/importação até a reativação.

## Referências de uso

[Formato de catálogos e API](catalog-format.md) · [Identidade oficial](design-system.md) · [Arquitetura](architecture.md).

## Verificação local

Em 07/11/2026, a validação completa passou com 17 testes unitários, 18 de integração com PostgreSQL e 5 E2E no Chromium. Foram exercitados XML, lote de 500 produtos, rejeição de lote inválido, rollback após conflito, reprocessamento idempotente, isolamento entre contas, roles, histórico, arquivamento e restauração da demonstração. Lint sem avisos, TypeScript estrito e build de produção da API e da web também passaram. Os ajustes finais de toque e texto foram verificados novamente por build e E2E.

O banco local usa Prisma Postgres embarcado. A CI está configurada para PostgreSQL 17 convencional, mas não foi executada no GitHub nesta entrega. Docker/Compose e deploy remoto não foram executados. A integração com fornecedores usa arquivos autorizados; nenhum conector de API externa foi ativado.

Screenshots reais da aplicação estão em `docs/screenshots/products-dark.png`, `suppliers-dark.png` e `products-mobile.png`. A documentação de formato inclui os limites e os campos aceitos. A tabela de opções da interface carrega até 100 fornecedores ativos; a listagem principal e a API são paginadas.

## Próxima fase

Fase 3: motor de precificação determinístico, cenários e testes financeiros, score de oportunidades baseado somente em evidências e ferramentas restritas para OpenAI. As tabelas de custo e origem desta fase fornecem a base. Chaves externas continuam pendentes; não há geração ou custo de tokens nesta entrega.
