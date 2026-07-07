import { config } from 'dotenv';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(serverDir, '../..');

config({ path: path.join(rootDir, '.env') });

const args = process.argv.slice(2).join(' ');
const migrationName = args || 'init';

execSync(`npx prisma migrate dev --schema prisma/schema.prisma --name ${migrationName}`, {
  cwd: serverDir,
  stdio: 'inherit',
  env: process.env,
});
