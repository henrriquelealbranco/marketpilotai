import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, hash] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !hash ||
    !/^[a-f0-9]{128}$/.test(hash) ||
    !/^[a-f0-9]{32}$/.test(salt)
  )
    return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
