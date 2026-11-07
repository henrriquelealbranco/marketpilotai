import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  createSessionToken,
} from '../../apps/api/src/crypto.js';

describe('credenciais', () => {
  it('verifica a senha correta e rejeita uma senha incorreta', async () => {
    const hash = await hashPassword('Senha-forte-123!');
    expect(hash).not.toContain('Senha-forte-123!');
    expect(await verifyPassword('Senha-forte-123!', hash)).toBe(true);
    expect(await verifyPassword('outra-senha', hash)).toBe(false);
  });
  it('usa salt único e rejeita hashes inválidos sem falhar', async () => {
    const a = await hashPassword('Senha-forte-123!');
    const b = await hashPassword('Senha-forte-123!');
    expect(a).not.toBe(b);
    expect(await verifyPassword('x', 'invalid')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$bad$')).toBe(false);
  });
  it('gera tokens não previsíveis e armazena apenas hash', () => {
    const first = createSessionToken();
    expect(first.length).toBeGreaterThanOrEqual(43);
    expect(first).not.toBe(createSessionToken());
    expect(hashToken(first)).toHaveLength(64);
    expect(hashToken(first)).not.toBe(first);
  });
});
