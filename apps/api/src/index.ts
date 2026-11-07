import 'dotenv/config';
import { buildApp } from './app.js';
import { database } from '@marketpilot/database';
const db = database();
const app = await buildApp({ db });
async function shutdown() {
  await app.close();
  await db.$disconnect();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
try {
  await app.listen({
    port: Number(process.env.PORT || 4000),
    host: process.env.HOST || '127.0.0.1',
  });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exitCode = 1;
}
