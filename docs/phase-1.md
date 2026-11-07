# Estado da Fase 1

Escopo: arquitetura, design system oficial, autenticação, dashboard e estrutura inicial. Atualização de identidade incorporada em 07/11/2026 sem reiniciar o projeto.

| Entrega              | Comportamento                                                                         |
| -------------------- | ------------------------------------------------------------------------------------- |
| Identidade           | Tokens oficiais roxo/lilás, Inter local, M vetorial, temas claro e escuro             |
| Autenticação         | Cadastro local habilitável, login, sessão no PostgreSQL, expiração e logout revogável |
| Workspace            | Conta isolada, papéis, nome persistente e alteração por administrador                 |
| Auditoria            | Eventos reais de cadastro, acesso, logout e alteração de nome                         |
| Dashboard            | API, agregação determinística, 7/30/90 dias, gráfico, ranking ordenável e CSV         |
| Conta nova           | Indicadores zerados; nenhum dado comercial fictício                                   |
| Demonstração         | Fixtures separadas, identificação permanente e nenhuma ação externa                   |
| Central de operações | Estrutura dos sete papéis, workflow estático, progresso não iniciado e painéis vazios |
| Demais áreas         | Rotas navegáveis com indicação da fase prevista                                       |
| Integrações          | Estados pendentes. Nenhuma credencial coletada nem adaptador comercial implementado   |
| Infraestrutura       | Banco local, migração versionada, API health/readiness e CI configurada               |
| Deploy               | Não realizado; previsto para a Fase 7                                                 |

## Validação

Verificação final local em 07/11/2026: `npm run validate` terminou com código 0. Lint sem avisos; TypeScript estrito; 8 testes unitários; 8 testes de integração; 3 testes E2E no Chromium; build de produção da API e da web. `npm audit --omit=dev` encontrou zero vulnerabilidades. O bundle compilado da API também respondeu 200 em health, readiness e dashboard demo. Formatação verificada com Prettier.

As evidências da execução ficam nos comandos e relatórios locais. `tests/unit` cobre os cálculos e credenciais; `tests/integration` usa PostgreSQL e a API real; `tests/e2e` cobre os fluxos no Chromium. Screenshots estão em `docs/screenshots`. A CI foi escrita, mas não executada no GitHub nesta entrega.

Prisma Postgres local usa um mecanismo PostgreSQL embarcado adequado ao desenvolvimento. A CI está configurada para PostgreSQL 17 convencional. Docker não estava instalado nesta máquina e o Compose não foi executado aqui.

## Pendências externas por fase

- Fase 2: fontes autorizadas de fornecedores; schema comercial e importação. Sem presumir API pública de Dogama/Dropi.
- Fase 3: chave OpenAI, ferramentas restritas e limites; motor determinístico de precificação e seus testes. Custos de IA continuarão zerados até execuções reais.
- Fase 4: Redis/BullMQ, credenciais n8n e dez workflows versionados com idempotência, logs, retry e assinatura de webhooks. SSE com eventos persistidos, sem depender da disponibilidade do n8n.
- Fase 5: aplicação OAuth Mercado Livre, escopos oficiais e conta autorizada. Publicação e ações sensíveis exigirão aprovação humana.
- Fase 6: analytics completo, PDF, landing page e apresentação expandida.
- Fase 7: revisão de segurança, LGPD, recuperação de acesso, backups/restauração, Dockerfiles, Coolify e VPS isolada. Nenhum serviço existente será alterado.

## Preparação da Fase 2

Adicionar Supplier, CatalogImport, Product e CostSnapshot com `workspaceId` em todos os registros. Valores monetários em centavos inteiros ou Decimal com arredondamento explícito. Rastrear origem e data de atualização. Validar CSV/XML com limite de tamanho, tratamento de encoding e prevenção de entidades externas no XML. Importações com hash e chave idempotente. Fixtures demo permanecem fora do banco comercial.

Próximo ciclo: especificar o formato de catálogo, escrever testes de autorização/duplicação/importação, criar migrações, implementar CRUD e validar lint, testes e build antes de iniciar a Fase 3.
