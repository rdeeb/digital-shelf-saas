import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

loadDotenv({ path: path.join(rootDir, '.env') });

const envSchema = z.object({
  APP_MODE: z.literal('cloud').default('cloud'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVER_HOST: z.string().default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().int().positive().default(8080),
  SERVER_PUBLIC_URL: z.string().url().default('http://localhost:8080'),
  DATABASE_URL: z.string().min(1),
  STEAM_API_KEY: z.string().default(''),
  FRAME_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  FRAME_STORAGE_PATH: z.string().default('./data/frames'),
  FRAME_STORAGE_BUCKET: z.string().default(''),
  FRAME_STORAGE_ENDPOINT: z.string().default(''),
  FRAME_STORAGE_ACCESS_KEY: z.string().default(''),
  FRAME_STORAGE_SECRET_KEY: z.string().default(''),
  SESSION_SECRET: z.string().min(16),
  MOBILE_TOKEN_SECRET: z.string().min(16),
  PAYPAL_CLIENT_ID: z.string().default(''),
  PAYPAL_CLIENT_SECRET: z.string().default(''),
  PAYPAL_WEBHOOK_ID: z.string().default(''),
  APPLE_BUNDLE_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  APPLE_ISSUER_ID: z.string().default(''),
  APPLE_PRIVATE_KEY: z.string().default(''),
  GOOGLE_PLAY_PACKAGE_NAME: z.string().default(''),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().default(''),
  DEFAULT_SCREEN_WIDTH: z.coerce.number().int().positive().default(172),
  DEFAULT_SCREEN_HEIGHT: z.coerce.number().int().positive().default(320),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  return result.data;
}
