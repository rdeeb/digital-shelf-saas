import type { FastifyReply } from 'fastify';

export const SESSION_COOKIE = 'ds_session';

export function setSessionCookie(reply: FastifyReply, sessionId: string, maxAgeDays: number): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeDays * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
