import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

config({ path: path.join(rootDir, '.env') });

process.env.APP_MODE ??= 'cloud';
process.env.DATABASE_URL ??=
  'postgresql://digitalshelf:digitalshelf@localhost:5432/digitalshelf';
process.env.SESSION_SECRET ??= 'test-session-secret-32-chars-min!!';
process.env.MOBILE_TOKEN_SECRET ??= 'test-mobile-secret-32-chars-min!!!';
