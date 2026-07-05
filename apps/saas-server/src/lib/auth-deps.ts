import { loadEnv } from '../config/env.js';
import { prisma } from '../db/client.js';
import { createAuthService, type AuthService } from '../services/auth-service.js';

export function createAuthServiceFromEnv(): AuthService {
  const env = loadEnv();
  return createAuthService(prisma, {
    sessionTtlDays: 30,
    mobileAccessTtlMinutes: 60,
    mobileRefreshTtlDays: 30,
    mobileTokenSecret: env.MOBILE_TOKEN_SECRET,
  });
}
