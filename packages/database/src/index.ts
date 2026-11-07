import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';
let client: PrismaClient | undefined;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL não configurada. Consulte .env.example.');
  client ??= new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    }),
  });
  return client;
}
export type Database = PrismaClient;
