# MarketPilot — conclusão das fases 3 a 7

Autorização: continuar até concluir todo o trabalho, sem confirmações rotineiras. Preservar as fases 1/2 e a identidade oficial. Execuções externas dependem de credenciais; não inventar resultados ou ativação de serviços.

## Frentes independentes

- [x] Precificação determinística, score com evidências e interface de cenários; testes unitários.
- [x] Adaptadores oficiais OpenAI Responses, Mercado Livre OAuth/REST e n8n; HTTP injetável, testes de contratos, segredos AES-GCM, nenhum acesso externo em testes.
- [x] Infraestrutura isolada: Dockerfiles/Compose dos seis serviços, worker BullMQ, onze workflows n8n, backup/restauração, health checks e guia Coolify.
- [x] Persistência e API de regras financeiras, análises, agentes, decisões, aprovações, anúncios, pedidos, eventos, alertas e conversas.
- [x] Central de operações com SSE real, histórico, custos e aprovações; execução somente quando configuração permite, demonstração identificada e isolada.
- [x] Telas operacionais restantes, relatórios/exportação, assistente e landing com screenshots reais e arquitetura.
- [x] Validação, revisão de segurança, documentação de estado, testes completos e registro Git.

## Contratos de integração

Frontend mantém `/app/[section]` privado e `/demo/[section]` isolado. API em `/v1/*`, com workspace exclusivamente da sessão. Novos módulos ficam separados de autenticação/catálogo. Alterações sensíveis usam aprovação persistida, idempotência e trilha de auditoria. Configuração ausente responde `configuration_required` com orientação; nunca sucesso fictício.

Responsabilidade central: schema Prisma, migrações, manifests compartilhados, integração das rotas e revisão final. Frentes delegadas têm diretórios exclusivos e não alteram esses arquivos. Relatórios em `.local/completion/`.

## Limites externos observados

OpenAI, Mercado Livre, n8n e Redis ainda não estão configurados em `.env`. Docker não está instalado nesta máquina. Preparar e testar código localmente, sem instalar serviços de sistema ou alterar outros sistemas da VPS. Deploy remoto e chamadas autenticadas reais somente com acesso fornecido/configurado; essa diferença deve constar no estado final.

## Encerramento local

Implementação, evidências e limites externos documentados em `docs/phase-3-7.md` e `docs/verification.md`. Ativação de contas, homologação Docker/n8n e publicação remota permanecem dependentes do ambiente de destino; não foram apresentadas como realizadas.
