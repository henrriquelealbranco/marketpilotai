import { createHash } from 'node:crypto';

export interface OutreachFingerprintInput {
  supplierId: string;
  email: string;
  subject: string;
  body: string;
}

/** Normalizes only a syntactically valid public business email; it does not verify ownership. */
export function normalizeContactEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      email,
    )
  )
    throw new Error('e-mail comercial inválido');
  return email;
}

/** One fingerprint per supplier, recipient and exact approved content prevents duplicate campaigns. */
export function outreachKey(input: OutreachFingerprintInput): string {
  const email = normalizeContactEmail(input.email);
  return createHash('sha256')
    .update(JSON.stringify({ supplierId: input.supplierId, email, subject: input.subject.trim(), body: input.body.trim() }))
    .digest('hex');
}
