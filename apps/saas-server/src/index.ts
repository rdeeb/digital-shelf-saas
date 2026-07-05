import { loadEnv } from './config/env.js';

const env = loadEnv();
const { buildApp } = await import('./app.js');

async function main() {
  const app = await buildApp({ logger: { level: env.LOG_LEVEL } });

  await app.listen({ host: env.SERVER_HOST, port: env.SERVER_PORT });
  app.log.info(`SaaS server listening on ${env.SERVER_PUBLIC_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
