import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';
import type { Prisma } from './generated/client.js';
let client: PrismaClient | undefined;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL não configurada. Consulte .env.example.');
  const poolSize = Number(
    process.env.DATABASE_POOL_SIZE ?? (process.env.NODE_ENV === 'production' ? 5 : 1),
  );
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 20)
    throw new Error('DATABASE_POOL_SIZE deve estar entre 1 e 20.');
  client ??= new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: poolSize,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    }),
  });
  return client;
}
export type Database = PrismaClient;
export type DatabaseTransaction = Prisma.TransactionClient;
