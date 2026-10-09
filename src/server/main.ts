import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { refreshStoredNutrition } from './services/recipes';

const config = loadConfig(process.env);
const database = createDatabase(config.databaseUrl);
await database.migrate();
// One-off catch-up for recipes saved before nutrition was computed; a no-op once they are current.
const refreshed = await refreshStoredNutrition(database);

const app = await buildApp({ config, database, clientDir: 'dist/client' });

const shutdown = async () => {
  await app.close();
  await database.close();
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

app.log.info({ refreshed }, 'stored nutrition refreshed');
await app.listen({ host: '0.0.0.0', port: config.port });
