import type { Connection } from 'mongoose';
import { AskAssistant } from '../modules/assistant/application/ask-assistant.js';
import { GuidedInterpreter } from '../modules/assistant/infrastructure/guided-interpreter.js';
import { createAssistantInterpreter } from './create-assistant-interpreter.js';
import { MongoAssistantRecords } from '../modules/assistant/infrastructure/mongo-assistant-records.js';
import type { AssistantCollections } from '../modules/assistant/infrastructure/mongo-assistant-records.js';
import type { ReadWorkspaceOverview } from '../modules/dashboard/application/read-workspace-overview.js';
import type { SearchWorkspace } from '../modules/search/application/search-workspace.js';

export function createAssistant(
  database: Connection,
  collections: AssistantCollections,
  overview: ReadWorkspaceOverview,
  search: SearchWorkspace,
  intelligent: {
    provider?: 'openai' | 'gemini';
    apiKey: string;
    model: string;
  } | null = null,
  now: () => Date = () => new Date(),
) {
  const records = new MongoAssistantRecords(database, collections);
  return new AskAssistant(
    {
      projects: (scope, status) => records.projects(scope, status),
      receivables: (scope) => records.receivables(scope),
      overview: async (scope) => {
        const data = await overview.execute(scope);
        return {
          asOf: data.asOf,
          facts: {
            clients: data.clients.active,
            projects: data.projects.active + data.projects.on_hold,
            tasks: data.tasks.todo + data.tasks.in_progress,
            finances: data.finances.map(({ currency, outstandingMinor }) => ({
              currency,
              outstandingMinor,
            })),
          },
        };
      },
      search: async (scope, query) => {
        const groups = await search.execute(scope, query);
        return {
          records: groups.flatMap((group) =>
            group.items.map((item) => ({
              kind: group.kind,
              id: item.id,
              title: item.title,
              subtitle: item.subtitle,
              status: item.archived ? 'archived' : '',
              currency: null,
              amountMinor: null,
            })),
          ),
          hasMore: groups.some((group) => group.hasMore),
        };
      },
    },
    new GuidedInterpreter(),
    createAssistantInterpreter(intelligent),
    now,
  );
}
