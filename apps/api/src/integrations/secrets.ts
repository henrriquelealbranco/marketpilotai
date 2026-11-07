import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConfigurationRequiredError, IntegrationError } from './http.js';

const aad = Buffer.from('MarketPilot:secret:v1', 'utf8');
function keyBytes(key: string | undefined): Buffer {
  if (!key) throw new ConfigurationRequiredError('secrets');
  const bytes = Buffer.from(key, 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== key) {
    throw new IntegrationError(
      'invalid_configuration',
      'Chave de criptografia deve conter 32 bytes em base64 canônico.',
      'secrets',
    );
  }
  return bytes;
}
export function encryptSecret(plaintext: string, key: string | undefined): string {
  const bytes = keyBytes(key);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', bytes, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    nonce.toString('base64url'),
    ciphertext.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join(':');
}
export function decryptSecret(ciphertext: string, key: string | undefined): string {
  const bytes = keyBytes(key);
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error();
    const encoded = parts.slice(1);
    const decoded = encoded.map((part) => Buffer.from(part, 'base64url'));
    if (decoded.some((part, index) => part.toString('base64url') !== encoded[index]))
      throw new Error();
    const [nonce, encrypted, tag] = decoded;
    if (!nonce || nonce.length !== 12 || !encrypted || !tag || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', bytes, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new IntegrationError(
      'invalid_ciphertext',
      'Não foi possível autenticar o segredo criptografado.',
      'secrets',
    );
  }
}
