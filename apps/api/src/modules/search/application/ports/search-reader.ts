import type { SearchGroup } from '../../domain/search-results.js';
export interface SearchReader {
  read(workspaceId: string, query: string): Promise<SearchGroup[]>;
}
