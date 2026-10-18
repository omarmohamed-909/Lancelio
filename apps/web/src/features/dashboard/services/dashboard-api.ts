import { request } from '../../../shared/api/http-client';
import { overviewSchema } from '../schemas/workspace-overview';
export function readDashboard(token: string, signal: AbortSignal) {
  return request('/dashboard', overviewSchema, {
    token,
    signal,
    method: 'GET',
  });
}
