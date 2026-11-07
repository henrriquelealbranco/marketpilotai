# Verificação local — 07/11/2026

Entrega 0.3.0, preservando as fases 1/2. Node 24, Windows, Chromium headless e Prisma Postgres local de desenvolvimento. GitHub CI está configurado com PostgreSQL 17; não foi executado remotamente nesta entrega.

| Verificação              | Resultado                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| ESLint                   | Sem erros/avisos                                                                                       |
| TypeScript               | API, web e worker aprovados                                                                            |
| Unitários                | 103 testes aprovados                                                                                   |
| Integração               | 33 testes aprovados; banco/HTTP locais, provedores externos com transporte controlado                  |
| Navegação                | 8 testes Playwright aprovados                                                                          |
| Build                    | API, worker e Next.js aprovados                                                                        |
| Infraestrutura           | Seis serviços e onze exports n8n validados estruturalmente                                             |
| Formatação               | Prettier aprovado                                                                                      |
| Dependências de produção | `npm audit --omit=dev`: zero vulnerabilidades                                                          |
| API compilada            | Readiness com banco, sessão Secure e PDF com Inter incorporada aprovados em processo local de produção |

Total: **144 testes automatizados**. Incluem cálculo/arredondamento financeiro, margens bloqueadas, independência dos cenários, sinais desconhecidos, importação atômica, CNPJ, autenticação/revogação, escopo entre workspaces e perfis de leitura.

Novas verificações cobrem corpo exato/timestamp HMAC, SSE, encerramento do servidor com feed aberto, revisão humana, hash adulterado, publicação concorrente, bloqueio de edição durante execução, resposta externa incerta, reconciliação por consulta autorizada e atualização aprovada para estoque zero. Reconciliação conserva preço/estoque observados. Nenhuma publicação, compra ou pagamento real ocorreu nos testes.

Playwright percorreu cadastro, catálogo, cotação, análise, decisão, pedido, PDF e aprovação bloqueada sem configuração. O demo percorreu os módulos sem chamar endpoints privados, incluindo workflow/aprovação simulados. Teclado, temas e ausência de overflow horizontal em 390 px foram verificados. Capturas reais em `docs/screenshots`: central escura/clara/móvel e landing.

PDFs da API fonte e compilada foram renderizados para inspeção visual. A fonte Inter local usa instância TTF regular da mesma distribuição da web, evitando falha de subset de WOFF2 variável no PDFKit. Licença SIL OFL em `apps/api/assets/fonts/LICENSE`; regeneração opcional em `scripts/prepare-pdf-font.py`. Build/runtime não exigem Python.

## Limites

Sem Docker, Redis, runtime n8n ou credenciais externas neste ambiente. Testes locais **não comprovam** containers, webhooks públicos, OAuth real, publicação comercial, faturamento OpenAI, agendas n8n, backup/restauração no destino, TLS ou carga da VPS. Ensaios e ativação estão em [deploy](deployment.md), [integrações](integrations.md) e [workflows](../workflows/README.md).

Backups/restauração foram preparados/revisados, sem execução contra base comercial. Nenhum sistema da VPS foi alterado. Não há repositório remoto Git configurado neste checkout.
