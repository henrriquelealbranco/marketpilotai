import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Reproducible UUID-v4 identifiers; regenerating an export keeps node identity stable.
function uuid(label) {
  const hex = createHash('sha256').update(label).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
const definitions = [
  [
    'discovery',
    '0 10 8 * * *',
    'Analisa somente o catálogo autorizado; descobre candidatos e persiste evidências.',
  ],
  [
    'pricing-monitor',
    '0 5 */2 * * *',
    'Recalcula cenários e sinaliza variações; não altera preços publicados.',
  ],
  [
    'availability-sync',
    '0 0 * * * *',
    'Solicita atualização a partir de fonte autorizada; sem conector retorna configuration_required.',
  ],
  [
    'listing-preparation',
    '0 20 9 * * 1-5',
    'Prepara recomendações para rascunhos; aprovação humana é obrigatória antes de publicar.',
  ],
  [
    'order-processing',
    '0 */15 * * * *',
    'Reconcilia pedidos e pendências autorizadas; nunca compra, paga ou cancela.',
  ],
  ['daily-report', '0 0 19 * * *', 'Consolida dados comerciais reais e custos registrados do dia.'],
  [
    'supplier-monitor',
    '0 30 7 * * 1-5',
    'Analisa histórico e pendências dos fornecedores do workspace.',
  ],
  [
    'opportunity-summary',
    '0 0 12 * * 1-5',
    'Resume oportunidades com evidências e incertezas registradas.',
  ],
  [
    'margin-alerts',
    '0 35 */2 * * *',
    'Identifica margem abaixo das regras e cria alertas internos.',
  ],
  ['failure-monitor', '0 */10 * * * *', 'Inspeciona falhas persistidas de agentes e workflows.'],
];
const validConfig =
  "={{ typeof 'http://marketpilot-api:4000' === 'string' && /^https?:\\/\\/[A-Za-z0-9.-]+(?::[0-9]+)?$/.test('http://marketpilot-api:4000') && /^[A-Za-z0-9_-]{1,128}$/.test(String($execution.id)) }}";
function makeWorkflow([key, cron, description]) {
  const nodes = [];
  const connections = {};
  function node(name, type, typeVersion, parameters, position, extra = {}) {
    nodes.push({
      id: uuid(`${key}/${name}`),
      name,
      type: `n8n-nodes-base.${type}`,
      typeVersion,
      position,
      parameters,
      ...extra,
    });
  }
  function wire(source, target, index = 0) {
    const slots = (connections[source] ??= { main: [] }).main;
    while (slots.length <= index) slots.push([]);
    slots[index].push({ node: target, type: 'main', index: 0 });
  }
  function http(name, endpoint, body, position, extra = {}) {
    node(
      name,
      'httpRequest',
      4.5,
      {
        method: 'POST',
        url: `={{ 'http://marketpilot-api:4000' + '${endpoint}' }}`,
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: body,
        options: {
          timeout: 30_000,
          redirect: { redirect: { followRedirects: false } },
          response: { response: { responseFormat: 'json' } },
        },
      },
      position,
      {
        // Resolve the real credential in the target instance; fake IDs disable its selector.
        notes:
          'Select the Header Auth credential named MarketPilot Internal API. Authorization header and bearer token belong only in that credential.',
        notesInFlow: true,
        retryOnFail: true,
        maxTries: 2,
        waitBetweenTries: 1_000,
        onError: 'continueErrorOutput',
        ...extra,
      },
    );
  }
  const body = `={{ JSON.stringify({ workflowKey: '${key}', source: 'n8n', executionId: String($execution.id), idempotencyKey: 'n8n-${key}-' + $execution.id, scheduledAt: $('Schedule').first().json.timestamp }) }}`;
  const failure = `={{ JSON.stringify({ workflowKey: '${key}', source: 'n8n', executionId: String($execution.id), idempotencyKey: 'n8n-failure-${key}-' + $execution.id, code: 'workflow_dispatch_failed', failedAt: $now.toISO() }) }}`;
  node(
    'Schedule',
    'scheduleTrigger',
    1.4,
    { rule: { interval: [{ field: 'cronExpression', expression: cron }] } },
    [0, 0],
    { notes: description },
  );
  node(
    'Validate configuration',
    'if',
    2.4,
    {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 4 },
        conditions: [
          {
            id: uuid(`${key}/config-condition`),
            leftValue: validConfig,
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    [240, 0],
  );
  node(
    'Invalid configuration',
    'stopAndError',
    1,
    {
      errorType: 'errorMessage',
      errorMessage:
        'marketpilot_configuration_required: check the internal API origin and select the protected Header Auth credential on every HTTP node',
    },
    [480, 240],
  );
  http('Dispatch attempt 1', '/internal/workflows/dispatch', body, [480, -80]);
  node(
    'Backoff 5 seconds',
    'wait',
    1.1,
    { resume: 'timeInterval', amount: 5, unit: 'seconds' },
    [720, 80],
  );
  http('Dispatch attempt 2', '/internal/workflows/dispatch', body, [960, 80]);
  node(
    'Backoff 10 seconds',
    'wait',
    1.1,
    { resume: 'timeInterval', amount: 10, unit: 'seconds' },
    [1200, 240],
  );
  http('Dispatch attempt 3', '/internal/workflows/dispatch', body, [1440, 240]);
  http('Persist failure and notify', '/internal/workflows/failure', failure, [1680, 400]);
  node(
    'Failed execution',
    'stopAndError',
    1,
    {
      errorType: 'errorMessage',
      errorMessage:
        'marketpilot_dispatch_failed: retries exhausted; inspect the persisted execution and internal notifications',
    },
    [1920, 400],
  );
  wire('Schedule', 'Validate configuration');
  wire('Validate configuration', 'Dispatch attempt 1');
  wire('Validate configuration', 'Invalid configuration', 1);
  wire('Dispatch attempt 1', 'Backoff 5 seconds', 1);
  wire('Backoff 5 seconds', 'Dispatch attempt 2');
  wire('Dispatch attempt 2', 'Backoff 10 seconds', 1);
  wire('Backoff 10 seconds', 'Dispatch attempt 3');
  wire('Dispatch attempt 3', 'Persist failure and notify', 1);
  wire('Persist failure and notify', 'Failed execution');
  wire('Persist failure and notify', 'Failed execution', 1);
  return {
    name: `MarketPilot / ${key}`,
    active: false,
    nodes,
    connections,
    settings: {
      executionOrder: 'v1',
      timezone: 'America/Sao_Paulo',
      executionTimeout: 300,
      saveDataErrorExecution: 'all',
      saveDataSuccessExecution: 'none',
      saveManualExecutions: false,
    },
    pinData: {},
    tags: [],
    meta: {
      marketpilot: {
        workflowKey: key,
        contractVersion: 1,
        description,
        requiresCredential: 'MarketPilot Internal API',
        internalApiOrigin: 'http://marketpilot-api:4000',
        externalActions:
          'Approval enforced by API; this workflow never publishes, purchases, pays or cancels.',
      },
    },
  };
}
await mkdir(new URL('../workflows/', import.meta.url), { recursive: true });
for (const definition of definitions) {
  await writeFile(
    new URL(`../workflows/${definition[0]}.json`, import.meta.url),
    `${JSON.stringify(makeWorkflow(definition), null, 2)}\n`,
  );
}
process.stdout.write(
  'Generated 10 inactive MarketPilot workflows. Credentials must be bound in n8n.\n',
);
