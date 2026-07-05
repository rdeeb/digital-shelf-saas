import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthService } from '../services/auth-service.js';
import { SESSION_COOKIE } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export async function resolveRequestUserId(
  request: FastifyRequest,
  auth: AuthService,
): Promise<string | null> {
  const sessionId = request.cookies[SESSION_COOKIE];
  if (sessionId) {
    const user = await auth.resolveWebSession(sessionId);
    if (user) {
      return user.id;
    }
  }

  const bearer = parseBearerToken(request.headers.authorization);
  if (bearer) {
    const user = await auth.resolveAccessToken(bearer);
    if (user) {
      return user.id;
    }
  }

  return null;
}

export function sendUnauthorized(reply: FastifyReply): void {
  reply.status(401).send({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required.',
    },
  });
}
