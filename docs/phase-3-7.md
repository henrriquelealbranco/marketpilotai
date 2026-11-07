# Continuação das fases 3–7

Esta entrega estende o projeto existente. Commits/documentos das fases 1/2 permanecem históricos; referências a módulos futuros neles descrevem a situação naquela entrega.

## Fase 3 — finanças e análises

Motor compartilhado, sem dependência de IA: centavos inteiros e pontos base. Taxas agregadas arredondam para cima; margens/ROI para baixo. O preço recomendado é ajustado para preservar a margem após arredondamento. Cenários calculam seu bloqueio independentemente do preço original. Tarifas, tributos e reservas são hipóteses do operador, não tabelas presumidas do marketplace.

Cotações persistem entradas e resultado. A publicação confere a cotação mais recente contra custo/frete atuais. A triagem por regras declara margem, estoque, prazo, qualidade e avaliação interna do fornecedor. Sinais de mercado ausentes permanecem desconhecidos. Sete agentes registram dados, recomendação, duração, erros e revisão. OpenAI usa Responses estruturado, `store:false`, ponteiros RFC 6901 validados e consultas restritas. Não se registra raciocínio interno privado.

## Fase 4 — central e orquestração

Eventos são persistidos antes do SSE, com cursor, heartbeat, retomada e revalidação da sessão. A interface distingue fila, execução, conclusão, falha e configuração pendente. Progresso real sem percentual é indeterminado. O demo gera eventos fictícios por interação identificada.

Workflows internos verificam dados disponíveis. Com Redis, pedidos são persistidos/enfileirados para o worker HMAC. Onze exports n8n orquestram os serviços; agendas precisam de importação/ativação e workspace habilitado. Sincronização sem conector autorizado retorna configuração pendente. Preparação de anúncio e processamento de pedido geram recomendações/conferências, sem compra ou publicação automática.

## Fase 5 — marketplace e pedidos

OAuth com PKCE, state de uso único e tokens AES-256-GCM. Consultas da própria conta, rascunhos e aprovações persistidos. User Products e Legacy são distintos e conferidos com a tag da conta. Publicação, descrição, preço e estoque usam recursos oficiais. Permissões/campos específicos ainda exigem homologação com credenciais reais.

Aprovações vinculam hash canônico, versão, valores, cotação, riscos, validade e revisor. Aprovar e executar são separados; claim atômico impede execução concorrente. Resposta incerta exige reconciliação sem repetir publicação automaticamente. O vínculo do item criado é preservado antes de enviar sua descrição.

Pedidos têm identificador único por workspace. A consulta importa recorte de até 50 vendas pagas, sem fingir todo o histórico. Notificações reconsultam recursos oficiais na fila, sem URLs arbitrárias. Custos não fornecidos pela API ficam pendentes de conferência. Dados do comprador são minimizados. Nenhum pagamento, compra, cancelamento ou reembolso é automático.

## Fase 6 — experiência e relatórios

Landing com SVG, arquitetura, desafios, agentes e captura real. Sem clientes/depoimentos/resultados inventados. Demo isolada tem catálogo, pedidos, gráficos, alertas, chat demonstrativo e aprovações fictícias. CSV/PDF reais identificam origem/data; impressão/PDF do demo conserva sua identificação.

## Fase 7 — qualidade e infraestrutura

Migrações, testes financeiros, adaptadores HTTP controlados, integração com banco e Playwright. Builds API/worker/web. Compose isola seis serviços, credenciais de banco, redes, volumes, memória e health checks. Backups validam arquivo/checksum e delimitam retenção. Produção exige HTTPS e cadastro fechado por padrão.

## Estado externo

- OpenAI: adaptador testado sem consumo real; falta chave/modelo local.
- Mercado Livre: adaptador/gates implementados; faltam aplicação OAuth, conta e homologação de categoria/logística/permissões.
- n8n/Redis: exports, fila e worker preparados; serviços não ativos neste ambiente.
- Fornecedores: CSV/XML operacional; APIs automáticas dependem de documentação/autorização, sem presumir Dogama/Dropi públicos.
- Docker/Hostinger/Coolify: arquivos/procedimento preparados; Docker ausente aqui e acesso remoto não fornecido. Imagens, TLS, backup/restauração e carga precisam de ensaio no destino.

Recortes de 50 produtos para IA, 100 registros operacionais recentes e 10.000 pedidos por relatório limitam consumo. Operações maiores exigem ampliar paginação/lotes; esses recortes não representam todo o histórico comercial.

## Detalhes de revisão

Pressão competitiva só entra no score quando registrada como avaliação interna em uma observação autorizada. Não representa demanda inferida. Cotações desatualizadas e fornecedores arquivados impedem elegibilidade; custos alterados, produtos recentes, possíveis equivalentes por SKU e candidatos a kits ficam nas evidências. Kits são sugestões para revisão e cotação própria, sem economia logística presumida.

Encaminhamentos a fornecedores e ações financeiras podem ser solicitados, revisados e ter resultado manual declarado. O sistema não realiza pagamento ou compra. Reconciliação de anúncio exige leitura oficial da conta e conferência humana, preservando preço/estoque efetivamente observados. Estoque zero pode ser enviado mediante aprovação para interromper disponibilidade, sem exigir margem de uma venda que não ocorrerá.

Validação detalhada: [verificação local](verification.md).
