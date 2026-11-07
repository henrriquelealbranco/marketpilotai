import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { dispatchJob } from './dispatch.js';
import { parseWorkflowJob, workflowJobId } from './contract.js';

const payload = {
  workspaceId: 'workspace_one',
  workflowKey: 'daily-report' as const,
  executionId: 'exec_123',
};
const config = {
  apiUrl: new URL('http://marketpilot-api:4000'),
  serviceKey: 'test-key-for-unit-verification-only-1234',
  timeout: 1_000,
};
afterEach(() => {
  vi.useRealTimers();
});

describe('worker authenticated dispatch', () => {
  it('signs the exact JSON bytes and UNIX seconds and follows no redirects', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T12:00:00.999Z'));
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 202 }));
    const result = await dispatchJob(payload, workflowJobId(payload), config, transport);
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe('http://marketpilot-api:4000/internal/jobs/run');
    expect(init?.redirect).toBe('error');
    expect(init?.body).toBe(JSON.stringify(payload));
    const headers = new Headers(init?.headers);
    const seconds = String(Math.floor(Date.now() / 1_000));
    expect(headers.get('x-marketpilot-timestamp')).toBe(seconds);
    expect(headers.get('x-marketpilot-signature')).toBe(
      createHmac('sha256', config.serviceKey).update(`${seconds}.${init?.body}`).digest('hex'),
    );
    expect(result).toEqual({ acknowledged: true, executionId: payload.executionId });
  });
  it('rejects forged job IDs before sending a request', async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(dispatchJob(payload, 'forged', config, transport)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects demo flags, unknown workflows and malformed workspace identifiers', () => {
    expect(() => parseWorkflowJob({ ...payload, demo: true })).toThrow('invalid_job_fields');
    expect(() => parseWorkflowJob({ ...payload, workflowKey: 'publish-now' })).toThrow(
      'invalid_workflowKey',
    );
    expect(() => parseWorkflowJob({ ...payload, workspaceId: '../other' })).toThrow(
      'invalid_workspaceId',
    );
    expect(workflowJobId(payload)).not.toContain(':');
    expect(workflowJobId(payload)).not.toBe(
      workflowJobId({ ...payload, workspaceId: 'workspace_two' }),
    );
  });
  it.each([400, 401, 403, 404, 409, 422])(
    'does not retry a permanent HTTP %i rejection',
    async (status) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
      await expect(
        dispatchJob(payload, workflowJobId(payload), config, transport),
      ).rejects.toBeInstanceOf(UnrecoverableError);
    },
  );
  it.each([408, 425, 429, 500, 502, 503, 504])(
    'leaves transient HTTP %i eligible for BullMQ backoff',
    async (status) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
      const error = await dispatchJob(payload, workflowJobId(payload), config, transport).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(UnrecoverableError);
      expect((error as Error).message).toBe(`internal_api_failed_${status}`);
    },
  );
  it('does not persist upstream error bodies or transport secrets in failedReason', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('Authorization: Bearer sensitive-value'));
    await expect(dispatchJob(payload, workflowJobId(payload), config, transport)).rejects.toThrow(
      /^internal_api_unavailable$/,
    );
  });
});
