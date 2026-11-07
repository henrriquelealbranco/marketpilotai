import 'dotenv/config';
import { createServer } from 'node:http';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAME, QUEUE_PREFIX } from './contract.js';
import { dispatchJob } from './dispatch.js';

function log(event: string, fields: Record<string, unknown> = {}) {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), service: 'marketpilot-worker', event, ...fields })}\n`,
  );
}
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; worker cannot execute without configuration`);
  return value;
}
function positiveInteger(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  return value;
}

async function main() {
  const redisUrl = required('REDIS_URL');
  const parsedRedis = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(parsedRedis.protocol))
    throw new Error('REDIS_URL must use redis:// or rediss://');
  const serviceKey = required('INTERNAL_SERVICE_KEY');
  if (serviceKey.length < 32)
    throw new Error('INTERNAL_SERVICE_KEY must have at least 32 characters');
  const apiUrl = new URL(required('API_INTERNAL_URL'));
  if (
    !['http:', 'https:'].includes(apiUrl.protocol) ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash
  )
    throw new Error('API_INTERNAL_URL must be an HTTP service origin without credentials');
  if (apiUrl.pathname !== '/') throw new Error('API_INTERNAL_URL must be an origin without a path');
  const concurrency = positiveInteger('WORKER_CONCURRENCY', 2, 16);
  const timeout = positiveInteger('WORKER_JOB_TIMEOUT_MS', 60_000, 300_000);
  const healthPort = positiveInteger('WORKER_HEALTH_PORT', 4001, 65535);
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 10_000,
  });
  connection.on('error', () => log('redis_connection_error'));
  // A failed first connection exits visibly. After startup ioredis reconnects automatically.
  await connection.connect();
  const worker = new Worker<unknown>(
    QUEUE_NAME,
    (job) => dispatchJob(job.data, job.id, { apiUrl, serviceKey, timeout }),
    {
      connection,
      prefix: QUEUE_PREFIX,
      concurrency,
      autorun: false,
      maxStalledCount: 1,
      lockDuration: Math.max(timeout + 30_000, 90_000),
      limiter: { max: concurrency * 5, duration: 1_000 },
    },
  );
  worker.on('error', () => log('worker_error'));
  worker.on('failed', (job) =>
    log('job_failed', { jobId: job?.id, attemptsMade: job?.attemptsMade }),
  );
  worker.on('completed', (job) => log('job_acknowledged', { jobId: job.id }));
  let closing = false;
  const health = createServer((request, response) => {
    if (request.url !== '/health' && request.url !== '/ready') {
      response.writeHead(404).end();
      return;
    }
    const ready = !closing && connection.status === 'ready' && worker.isRunning();
    response.writeHead(request.url === '/health' || ready ? 200 : 503, {
      'content-type': 'application/json',
    });
    response.end(JSON.stringify({ service: 'marketpilot-worker', ready }));
  });
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    log('shutdown_started');
    health.close();
    const deadline = setTimeout(() => {
      log('shutdown_timeout');
      process.exit(1);
    }, timeout + 30_000);
    deadline.unref();
    try {
      await worker.close();
      await connection.quit();
    } finally {
      clearTimeout(deadline);
    }
    log('shutdown_complete');
  };
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
  await worker.waitUntilReady();
  health.listen(healthPort, '0.0.0.0');
  log('worker_started', { queue: QUEUE_NAME, concurrency });
  await worker.run();
}

main().catch((error: unknown) => {
  // Startup errors are locally generated configuration messages; never print connection objects.
  log('startup_failed', {
    message:
      error instanceof Error &&
      /^(REDIS_URL|INTERNAL_SERVICE_KEY|API_INTERNAL_URL|WORKER_)/.test(error.message)
        ? error.message
        : 'worker_startup_failed; check Redis connectivity and service configuration',
  });
  process.exit(1);
});
