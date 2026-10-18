import type { Connection } from 'mongoose';
import { ReadWorkspaceOverview } from '../modules/dashboard/application/read-workspace-overview.js';
import { MongoWorkspaceOverview } from '../modules/dashboard/infrastructure/mongo-workspace-overview.js';
import type { OverviewCollections } from '../modules/dashboard/infrastructure/mongo-workspace-overview.js';
export function createDashboard(
  database: Connection,
  collections: OverviewCollections,
  now: () => Date = () => new Date(),
) {
  return new ReadWorkspaceOverview(
    new MongoWorkspaceOverview(database, collections),
    now,
  );
}
