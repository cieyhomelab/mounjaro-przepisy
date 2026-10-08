import type { FastifyInstance } from 'fastify';
import { snapshotEtag } from '../../shared/contracts/snapshot';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { buildSnapshot, readDataVersion } from '../services/snapshot';

export function registerSnapshotRoutes(
  app: FastifyInstance,
  deps: { database: Database; clock: Clock },
) {
  app.get('/api/snapshot', async (request, reply) => {
    const accountId = request.session?.accountId ?? '';
    const known = request.headers['if-none-match'];
    // Cheap check first: a client that is up to date gets 304 without the data being read.
    const current = snapshotEtag(await readDataVersion(deps.database, accountId));
    if (known === current) return reply.code(304).header('ETag', current).send();
    const snapshot = await buildSnapshot(deps.database, accountId, deps.clock.now());
    return reply
      .header('ETag', snapshotEtag(snapshot.dataVersion))
      .header('Cache-Control', 'private, no-cache')
      .send(snapshot);
  });
}
