# Workflows MarketPilot

Dez agendas e um handler de erros, exportados desativados e sem segredos/IDs de credenciais. Preparados para n8n 2.46.6; importação e runtime precisam de homologação no destino. Validação local verifica JSON, conexões, autenticação, erros e downloads públicos, sem executar n8n.

| Arquivo             | Trabalho solicitado à API                                        |
| ------------------- | ---------------------------------------------------------------- |
| discovery           | Candidatos do catálogo autorizado                                |
| pricing-monitor     | Cotações e custos alterados                                      |
| availability-sync   | Exige conector autorizado; ausente retorna configuração pendente |
| listing-preparation | Recomendações para rascunhos, sem publicação                     |
| order-processing    | Conferência, sem compras/pagamentos                              |
| daily-report        | Consolidação dos dados disponíveis                               |
| supplier-monitor    | Estoque, fornecedor e catálogo                                   |
| opportunity-summary | Resumo persistido de candidatos                                  |
| margin-alerts       | Custos e margens informados                                      |
| failure-monitor     | Falhas registradas                                               |
| error-handler       | Error Trigger para falhas não capturadas                         |

## Importação

1. Configure PostgreSQL, Redis, API/worker e `N8N_SERVICE_TOKEN` independente com 32+ caracteres.
2. No n8n crie credencial **Header Auth**, nome `MarketPilot Internal API`, campo `Authorization`, valor `Bearer SEU_TOKEN`. Nunca inclua o valor no export.
3. Importe os onze arquivos e selecione a credencial em todos os HTTP Request nodes.
4. Origem interna: `http://marketpilot-api:4000`. Se mudar, substitua nos HTTP nodes e na validação. Endereço não secreto, sem depender de `$vars` pago ou liberar variáveis de ambiente.
5. Confira America/Sao_Paulo e cada Schedule Trigger. A próxima execução é calculada pelo n8n, não inventada no MarketPilot.
6. Escolha o workflow importado `MarketPilot / error-handler` em **Settings → Error workflow** das dez agendas. O ID nasce na importação, sem hardcode no export.
7. Teste credencial, execução e notificação de falha em ambiente de teste. Ative agenda no n8n e habilite o workflow para o workspace no MarketPilot.

HTTP nodes têm timeout, retry e saídas de erro conectadas. Despachos repetem a mesma chave por execução, com espera crescente. API persiste idempotência por workspace; BullMQ deriva job ID do conteúdo, com cinco tentativas/backoff. Falhas vão para `/internal/workflows/failure`; se a própria API cair, o erro fica no n8n. Operação desassistida deve monitorar disponibilidade fora dessa dependência.

Habilitar agenda no MarketPilot não ativa workflow remoto. A interface distingue execução interna, fila e origem n8n. Ações comerciais continuam condicionadas à aprovação na API; workflows não pagam, compram, cancelam ou publicam diretamente.
