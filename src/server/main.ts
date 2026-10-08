import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';

const config = loadConfig(process.env);
const database = createDatabase(config.databaseUrl);
await database.migrate();

const app = await buildApp({ config, database, clientDir: 'dist/client' });

const shutdown = async () => {
  await app.close();
  await database.close();
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

await app.listen({ host: '0.0.0.0', port: config.port });
