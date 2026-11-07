import { spawn } from 'node:child_process';

const [service, command, ...args] = process.argv.slice(2);
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
if (!['api', 'web', 'worker'].includes(service) || !command)
  fail('Invalid production launch command');
if (process.env.NODE_ENV !== 'production') fail('NODE_ENV must be production');
let appOrigin;
try {
  appOrigin = new URL(process.env.APP_ORIGIN);
} catch {
  fail('APP_ORIGIN must be a valid HTTPS origin');
}
if (
  appOrigin.protocol !== 'https:' ||
  appOrigin.username ||
  appOrigin.password ||
  appOrigin.pathname !== '/' ||
  appOrigin.search ||
  appOrigin.hash
)
  fail('APP_ORIGIN must be a valid HTTPS origin without a path or credentials');
if (service === 'api' || service === 'worker') {
  if (!process.env.INTERNAL_SERVICE_KEY || process.env.INTERNAL_SERVICE_KEY.length < 32)
    fail('INTERNAL_SERVICE_KEY must have at least 32 characters');
}
if (
  service === 'api' &&
  (!process.env.N8N_SERVICE_TOKEN || process.env.N8N_SERVICE_TOKEN.length < 32)
)
  fail('N8N_SERVICE_TOKEN must have at least 32 characters');
const child = spawn(command, args, { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => fail('Could not start production service'));
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
