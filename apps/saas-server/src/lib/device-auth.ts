import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateDeviceToken(): string {
  return `dev_tok_${randomBytes(32).toString('base64url')}`;
}

export function verifyDeviceToken(token: string, tokenHash: string): boolean {
  if (!tokenHash) return false;
  const computed = hashDeviceToken(token);
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(tokenHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseBearerToken(authorization?: string): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function isDeviceClaimed(tokenHash: string): boolean {
  return tokenHash.length > 0;
}

declare module 'fastify' {
  interface FastifyRequest {
    deviceId?: string;
  }
}

export function createDeviceAuthHook(prisma: PrismaClient) {
  return async function deviceAuthHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = parseBearerToken(request.headers.authorization);
    if (!token) {
      reply.status(401).send({
        error: { code: 'INVALID_DEVICE_TOKEN', message: 'Missing or invalid Bearer token.' },
      });
      return;
    }

    const hash = hashDeviceToken(token);
    const device = await prisma.device.findFirst({ where: { tokenHash: hash } });
    if (!device) {
      reply.status(401).send({
        error: { code: 'INVALID_DEVICE_TOKEN', message: 'Invalid device token.' },
      });
      return;
    }

    if (!isDeviceClaimed(device.tokenHash)) {
      reply.status(403).send({
        error: { code: 'DEVICE_NOT_CLAIMED', message: 'Device has not been claimed yet.' },
      });
      return;
    }

    request.deviceId = device.id;
    if (device.userId) {
      request.userId = device.userId;
    }
  };
}
