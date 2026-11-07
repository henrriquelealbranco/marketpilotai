import { describe, it, expect } from 'vitest';
import { dispatchJob } from '../../apps/worker/src/dispatch.js';
import {
  parseWorkflowJob,
  workflowJobId,
  serviceSignature,
} from '../../apps/worker/src/contract.js';
const payload = {
  workspaceId: 'workspace-1',
  workflowKey: 'discovery',
  executionId: 'execution-1',
} as const;
describe('contrato do worker', () => {
  it('valida o payload e vincula a identidade do job ao conteúdo', () => {
    expect(parseWorkflowJob(payload)).toEqual(payload);
    expect(() =>
      parseWorkflowJob({ ...payload, workflowKey: 'publish-without-approval' }),
    ).toThrow();
    expect(() => parseWorkflowJob({ ...payload, token: 'secret' })).toThrow();
    expect(workflowJobId(payload)).not.toBe(workflowJobId({ ...payload, workspaceId: 'other' }));
  });
  it('assina o corpo exato e não transmite credenciais na URL', async () => {
    let called = false;
    const key = 'x'.repeat(32);
    await dispatchJob(
      payload,
      workflowJobId(payload),
      { apiUrl: new URL('http://marketpilot-api:4000'), serviceKey: key, timeout: 1000 },
      async (url, init) => {
        called = true;
        expect(String(url)).toBe('http://marketpilot-api:4000/internal/jobs/run');
        const headers = new Headers(init?.headers);
        expect(headers.get('x-marketpilot-signature')).toBe(
          serviceSignature(headers.get('x-marketpilot-timestamp')!, String(init?.body), key),
        );
        return new Response('{}', { status: 200 });
      },
    );
    expect(called).toBe(true);
  });
  it('não repete falhas definitivas e preserva erros transitórios para o backoff', async () => {
    const config = {
      apiUrl: new URL('http://localhost:4000'),
      serviceKey: 'x'.repeat(32),
      timeout: 1000,
    };
    await expect(
      dispatchJob(
        payload,
        workflowJobId(payload),
        config,
        async () => new Response('{}', { status: 403 }),
      ),
    ).rejects.toHaveProperty('name', 'UnrecoverableError');
    await expect(
      dispatchJob(
        payload,
        workflowJobId(payload),
        config,
        async () => new Response('{}', { status: 503 }),
      ),
    ).rejects.toThrow('internal_api_failed_503');
  });
});
