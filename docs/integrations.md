# Integrações e segurança operacional

## OpenAI

Defina `OPENAI_API_KEY`/`OPENAI_MODEL` no servidor. O modelo precisa aceitar Responses e JSON estruturado. `AI_DAILY_TOKEN_LIMIT` é teto conservador por workspace/dia UTC: uma análise por vez, reserva pelo tamanho do contexto e limite de saída. Índice parcial PostgreSQL impede concorrência entre processos. Uso ausente/falha mantém reserva conservadora; tokens informados são separados da reserva. Execuções interrompidas por mais de dez minutos podem ser encerradas como falha antes de nova solicitação.

Configure `OPENAI_INPUT_PRICE_PER_MILLION`/`OPENAI_OUTPUT_PRICE_PER_MILLION` em USD conforme o contrato do modelo. Sem ambas, custo é desconhecido; não há conversão implícita para reais. O provedor recebe catálogo/métricas permitidos, sem contatos, compradores ou tokens. Textos de catálogo são dados não confiáveis. Evidências apontam para contexto existente; recomendações não autorizam mutações.

Referência: [Responses API](https://platform.openai.com/docs/api-reference/responses).

## Mercado Livre

Cadastre a aplicação oficial e permissões necessárias. Configure client ID/secret, `ENCRYPTION_KEY` (32 bytes aleatórios em base64) e `MERCADOLIVRE_REDIRECT_URI` HTTPS igual à registrada. Um ADMIN inicia OAuth; callback confere sessão, state, usuário e PKCE. State expira em dez minutos e é consumido uma vez. Tokens ficam criptografados e são renovados no servidor. Perder/trocar a chave exige reconectar contas. Desconectar apaga tokens locais; permissões também podem ser revogadas na conta oficial.

Confirme categoria, atributos, imagens, tipo de anúncio, documentação fiscal, logística e condições contratuais antes da aprovação. Não há promessa de elegibilidade de dropshipping para qualquer conta/produto. User Products envia `family_name`; Legacy envia `title`; a execução consulta `user_product_seller`. Descrição é enviada após criar o item. Estoque distribuído, variações, catálogo/promoções e modelos específicos exigem homologação própria.

Preço/estoque exigem nova aprovação. Conteúdo aprovado não é alterado silenciosamente. Quando o serviço não confirma uma ação, confira o estado externo/local antes de outra tentativa. Não redefina aprovações incertas para APPROVED diretamente.

Notificações: URL HTTPS `https://SEU_DOMINIO/api/v1/webhooks/mercadolivre?token=TOKEN_DEDICADO`, segredo independente `MERCADOLIVRE_NOTIFICATION_TOKEN`, Redis/worker ativos. Tópicos: `orders_v2`, `shipments`, `items`. A API valida aplicação, conta, tópico/recurso, persiste idempotência e reconsulta oficialmente. O token protege a URL configurada; não é assinatura fornecida pelo Mercado Livre. Confirme a entrega da query durante homologação. Logs omitem queries para proteger token/código OAuth. Itens geram evento de consulta; envios atualizam somente pedidos vinculados pelo shipping ID da ordem.

Fontes: [OAuth](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao), [User Products](https://developers.mercadolivre.com.br/pt_br/publicacao-de-produtos/user-products), [publicações/descrições](https://developers.mercadolivre.com.br/pt_br/pt_br/publicacao-de-produtos), [notificações](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/produto-receba-notificacoes). Busca geral de comparáveis não é presumida: use observações autorizadas ou amplie após confirmar acesso oficial.

## n8n e worker

`N8N_BASE_URL`/`N8N_API_KEY` consultam a API somente no servidor. Ative a API pública n8n apenas se necessária; despacho n8n → MarketPilot não depende dela. Webhooks do adaptador são allowlisted; não se usa endpoint fictício de execução.

Worker: HMAC SHA-256 sobre timestamp/corpo exato, janela de cinco minutos, chave `INTERNAL_SERVICE_KEY`. n8n: Header Auth protegido `Authorization: Bearer N8N_SERVICE_TOKEN`. Endpoints internos dispensam Origin porque têm autenticação própria; demais writes exigem Origin correto e sessão. Veja [workflows](../workflows/README.md).

Fontes: [API](https://docs.n8n.io/api/), [autenticação](https://docs.n8n.io/api/authentication/), [Docker](https://docs.n8n.io/hosting/installation/docker/).

## Acesso e dados

Workspace vem da sessão. VIEWER consulta; OPERATOR registra operações internas; ADMIN revisa/executa ações sensíveis e configura conexões/agenda. Tokens de sessão usam hash, senhas scrypt, cookie HttpOnly/SameSite=Lax e Secure em produção. Rate limit em memória é por instância; escala horizontal exige armazenamento compartilhado/proxy.

Não envie segredos pelo browser ou em `NEXT_PUBLIC_*`. Dados de compradores são minimizados. O administrador estabelece base legal, retenção e atendimento a titulares conforme sua operação; software sozinho não assegura LGPD. Proteja e criptografe backups fora do servidor. Não use banco de desenvolvimento para dados comerciais reais.

O rate limit privado usa o usuário de uma sessão válida; tentativas sem sessão permanecem limitadas por IP. A identidade é reutilizada apenas dentro da mesma requisição, e o SSE revalida a sessão a cada consulta. Há limite de cinco feeds simultâneos por usuário e encerramento dos streams antes de fechar o servidor.
