import { createHash, createHmac } from 'node:crypto';

export const QUEUE_NAME = 'marketpilot-workflows';
export const QUEUE_PREFIX = 'marketpilot';
export const WORKFLOW_KEYS = [
  'discovery',
  'pricing-monitor',
  'availability-sync',
  'listing-preparation',
  'order-processing',
  'daily-report',
  'supplier-monitor',
  'opportunity-summary',
  'margin-alerts',
  'failure-monitor',
] as const;
export type WorkflowKey = (typeof WORKFLOW_KEYS)[number];
export interface WorkflowJob {
  workspaceId: string;
  workflowKey: WorkflowKey;
  executionId: string;
}

export function parseWorkflowJob(input: unknown): WorkflowJob {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('invalid_job_payload');
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !['workspaceId', 'workflowKey', 'executionId'].includes(key))
  )
    throw new Error('invalid_job_fields');
  for (const key of ['workspaceId', 'executionId'] as const) {
    if (typeof value[key] !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value[key]))
      throw new Error(`invalid_${key}`);
  }
  if (!WORKFLOW_KEYS.includes(value.workflowKey as WorkflowKey))
    throw new Error('invalid_workflowKey');
  return value as unknown as WorkflowJob;
}

export function workflowJobId(job: WorkflowJob): string {
  return createHash('sha256')
    .update(`${job.workspaceId}\0${job.workflowKey}\0${job.executionId}`)
    .digest('hex');
}

export function serviceSignature(timestamp: string, rawBody: string, key: string): string {
  return createHmac('sha256', key).update(`${timestamp}.${rawBody}`).digest('hex');
}

export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000, jitter: 0.25 },
  removeOnComplete: { age: 604_800, count: 10_000 },
  removeOnFail: { age: 2_592_000, count: 10_000 },
};
