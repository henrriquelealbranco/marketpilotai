# Deploy isolado — Hostinger / Coolify

Estado: arquivos preparados, sem deploy remoto realizado. Docker não está instalado no ambiente de desenvolvimento desta entrega; imagem, health checks, TLS e restauração devem ser ensaiados no servidor de homologação. Não altere serviços existentes da VPS.

## Capacidade e isolamento

Orçamento inicial de engenharia, sem benchmark de carga: 2 vCPU, 4 GB de RAM livres e 20 GB de disco para os seis serviços e retenção curta. Builds Next.js e picos do n8n precisam de folga adicional; reserve 8 GB ou faça build fora do servidor quando houver outros projetos. Meça CPU/memória, pool de conexões e latência antes de liberar tráfego. Os limites no Compose somam aproximadamente 3,2 GB; não representam consumo garantido nem capacidade comercial.

Crie um projeto/recurso exclusivo, nome `marketpilot` ou `marketpilot-ambiente`. Volumes `postgres-data`, `redis-data` e `n8n-data` recebem prefixo do projeto. PostgreSQL tem bancos e usuários separados para aplicação e n8n, sem acesso público. Redis usa senha, AOF e política noeviction; fila usa prefixo próprio. Somente web/n8n têm binding local; API/worker/bancos ficam nas redes internas. Todos têm health checks, limites e rotação de logs.

## Configuração

1. Copie `.env.production.example` para `.env.production` fora do Git. Use senhas URL-safe aleatórias distintas (hex é conveniente para URLs PostgreSQL/Redis). Gere chaves independentemente. Para AES, `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"`; execute localmente no servidor e armazene em gerenciador seguro.
2. Defina domínio HTTPS, origem pública, hostname/URL n8n e callback OAuth. Preserve `ENCRYPTION_KEY` e `N8N_ENCRYPTION_KEY` em backup seguro separado. Não reaproveite senhas/chaves de outros projetos.
3. Fixe `N8N_IMAGE` em versão/digest homologado. O exemplo usa `2.46.6`, referência dos exports; não usa `latest`. Avalie atualizações no staging. Chaves externas são opcionais para módulos locais.
4. No Coolify conecte o repositório em um recurso Docker Compose novo. Selecione `compose.production.yaml`. Cadastre variáveis no cofre do recurso; não cole segredos em Dockerfiles/workflows. Configure domínio da web na porta interna 3000 e n8n na 5678. O proxy precisa estar na rede do serviço; use a configuração do recurso Coolify, sem alterar redes de outros projetos.
5. Ative TLS automático, redirecionamento HTTP→HTTPS e HSTS no proxy. Restrinja o editor n8n a administradores por VPN/allowlist quando possível. Não publique 4000/4001/5432/6379. Preserve streaming SSE sem buffering e timeout compatível com heartbeat.

## Subida e migrações

Em uma instalação Docker Compose independente, a sequência é:

```bash
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml up -d marketpilot-postgres marketpilot-redis
docker compose --env-file .env.production -f compose.production.yaml -f infra/compose.migrate.yaml --profile migrate run --rm --build marketpilot-migrate
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
```

O arquivo complementar cria somente uma tarefa de migração, não um sétimo serviço permanente. O caminho de build é relativo ao primeiro Compose. No Coolify execute a mesma migração em tarefa isolada com rede/variáveis do projeto, antes de liberar o novo backend. A imagem API runtime não contém a CLI Prisma; use o target `migrate`.

Para criar o primeiro ADMIN, habilite temporariamente `ALLOW_REGISTRATION=true` com acesso de rede restrito, crie a conta e retorne a `false`. Uma conta nova começa ADMIN no próprio workspace, não possui acesso aos demais. Não habilite cadastro aberto indiscriminadamente para compartilhar uma operação. Convites/equipes entre usuários não fazem parte desta entrega.

Configure n8n conforme [workflows](../workflows/README.md). Sua API pública fica desativada por padrão; `N8N_PUBLIC_API_DISABLED=false` e chave só são necessários para consulta do painel. Despacho agendado usa credencial Header Auth independente. Integrações externas seguem [guia próprio](integrations.md).

## Verificação no destino

- Confirme containers saudáveis e readiness API consultando PostgreSQL.
- Entre/crie catálogo de teste, salve cotação e execute regras. Confira evento SSE e auditoria.
- Confira bloqueio sem credenciais e permissões de leitura/administrador.
- Execute job real de teste com Redis/worker e workflow n8n manual, repetindo a mesma chave para confirmar idempotência.
- Homologue OAuth/callback/notificações com conta de teste e categoria permitida. Publicação só após revisão explícita do conteúdo e impacto.
- Exporte CSV/PDF e confira origem, valores, caracteres e cortes de página.
- Faça backup e restaure em uma instância de homologação separada. Não teste restauração no banco comercial ativo.

## Backups e restauração

`scripts/backup.sh` (Linux) e `scripts/backup.ps1` (PowerShell 7.2+) fazem pg_dump custom apenas do banco da aplicação, verificam `pg_restore --list`, geram SHA-256 e aplicam retenção de 14 dias, delimitada a nomes próprios. Configure `MARKETPILOT_ENV_FILE`, `MARKETPILOT_PROJECT_NAME` e `MARKETPILOT_BACKUP_ROOT`. O destino deve ser exclusivo, com permissão restrita e cópia criptografada fora da VPS. Execute por cron/tarefa do servidor após validar o procedimento; este repositório não instala agenda do sistema.

Os scripts **não** substituem backup do banco/volume n8n, Redis ou chaves. Inclua esses dados no plano do servidor e teste a recuperação consistente, com serviços parados quando necessário. Não exporte credenciais n8n descriptografadas.

Restauração Linux, com o arquivo e checksum verificados:

```bash
bash scripts/restore.sh --confirm-marketpilot-restore /CAMINHO/marketpilot-YYYYMMDDTHHMMSSZ.dump
```

É uma operação destrutiva explicitamente sinalizada: interrompe somente web/API/worker/n8n do projeto, restaura o banco MarketPilot em transação e mantém aplicações paradas. Aplique migrações, confira as chaves e valide antes de subir. O script não apaga volumes nem modifica outros projetos.

## Atualização e reversão

Guarde tag/digest anterior e backup verificado antes de migrar. Teste migrações e carga no staging. Migrações são para frente; reverter apenas a imagem pode ser incompatível com schema novo. Quando for necessária recuperação do banco, use o procedimento controlado e avalie operações externas já executadas: restaurar banco não desfaz publicações no marketplace. Aprovações em EXECUTING/RECONCILIATION_REQUIRED exigem conferência externa, sem reenvio automático.
