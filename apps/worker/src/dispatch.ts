import { UnrecoverableError } from 'bullmq';
import { parseWorkflowJob, serviceSignature, workflowJobId } from './contract.js';

export interface DispatchConfiguration {
  apiUrl: URL;
  serviceKey: string;
  timeout: number;
}

export async function dispatchJob(
  input: unknown,
  id: string | undefined,
  config: DispatchConfiguration,
  transport: typeof fetch = fetch,
) {
  let payload;
  try {
    payload = parseWorkflowJob(input);
  } catch {
    throw new UnrecoverableError('invalid_job_payload');
  }
  if (id !== workflowJobId(payload)) throw new UnrecoverableError('invalid_job_id');
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  let response: Response;
  try {
    response = await transport(new URL('/internal/jobs/run', config.apiUrl), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(config.timeout),
      headers: {
        'content-type': 'application/json',
        'x-marketpilot-timestamp': timestamp,
        'x-marketpilot-signature': serviceSignature(timestamp, rawBody, config.serviceKey),
      },
      body: rawBody,
    });
  } catch {
    throw new Error('internal_api_unavailable');
  }
  await response.body?.cancel();
  if (!response.ok) {
    if (
      response.status >= 400 &&
      response.status < 500 &&
      ![408, 425, 429].includes(response.status)
    )
      throw new UnrecoverableError(`internal_api_rejected_${response.status}`);
    throw new Error(`internal_api_failed_${response.status}`);
  }
  return { acknowledged: true, executionId: payload.executionId };
}
