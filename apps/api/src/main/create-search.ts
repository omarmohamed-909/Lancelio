import type { Connection } from 'mongoose';
import { SearchWorkspace } from '../modules/search/application/search-workspace.js';
import { MongoSearchReader } from '../modules/search/infrastructure/mongo-search-reader.js';
import type { SearchCollections } from '../modules/search/infrastructure/mongo-search-reader.js';
export function createSearch(
  database: Connection,
  collections: SearchCollections,
) {
  return new SearchWorkspace(new MongoSearchReader(database, collections));
}
