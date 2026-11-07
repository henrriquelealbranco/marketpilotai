# MarketPilot AI

Este é o repositório do MarketPilot AI. Não altere projetos no diretório pai.

- Leia README.md, docs/architecture.md e docs/phase-1.md antes de ampliar a implementação.
- Identidade oficial: docs/design-system.md e docs/brand/styleboard.png. Inter; #7C3AED, #A855F7, #C084FC, #0B0B12, #181825, #F5F5FA. Componentes usam tokens globais, não uma paleta paralela.
- Preserve o escopo por fases. A entrega atual é a Fase 1. Execuções de agentes, n8n e operações Mercado Livre não podem ser apresentadas como implementadas.
- `/demo` e `/v1/demo/*` nunca escrevem em dados comerciais nem chamam serviços externos. Identificação Demonstração permanente.
- APIs privadas exigem sessão válida e workspace do usuário; não aceite workspaceId fornecido pelo navegador como autorização.
- Não versione .env, tokens, senhas, dados pessoais reais ou cliente Prisma gerado.
- Para concluir alterações: npm run lint, npm run typecheck, npm test e npm run build; integração com banco e E2E quando o comportamento afetado exigir.
- Em apps/web, leia também AGENTS.md gerado pelo Next.js e a documentação local citada nele.
