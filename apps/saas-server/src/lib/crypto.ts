import { createHash } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(bytes = 32): string {
  return createHash('sha256')
    .update(`${Date.now()}-${Math.random()}-${bytes}`)
    .digest('base64url');
}
