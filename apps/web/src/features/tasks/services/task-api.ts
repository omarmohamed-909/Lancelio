import { ApiError, request } from '../../../shared/api/http-client';
import { errorMessage } from '../../auth/services/auth-api';
import { taskBoardSchema } from '../schemas/task';
import type { TaskInput, TaskStatus } from '../schemas/task';
const path = (projectId: string) => '/projects/' + projectId + '/tasks';
export const taskApi = {
  read: (token: string, projectId: string, signal: AbortSignal) =>
    request(path(projectId), taskBoardSchema, { token, method: 'GET', signal }),
  create: (
    token: string,
    projectId: string,
    version: number,
    input: TaskInput,
    signal: AbortSignal,
  ) =>
    request(path(projectId), taskBoardSchema, {
      token,
      body: { version, ...input },
      signal,
    }),
  update: (
    token: string,
    projectId: string,
    id: string,
    version: number,
    input: TaskInput,
    signal: AbortSignal,
  ) =>
    request(path(projectId) + '/' + id, taskBoardSchema, {
      token,
      method: 'PUT',
      body: { version, ...input },
      signal,
    }),
  move: (
    token: string,
    projectId: string,
    id: string,
    version: number,
    status: TaskStatus,
    beforeTaskId: string | null,
    signal: AbortSignal,
  ) =>
    request(path(projectId) + '/' + id + '/move', taskBoardSchema, {
      token,
      body: { version, status, beforeTaskId },
      signal,
    }),
  setVisibility: (
    token: string,
    projectId: string,
    id: string,
    version: number,
    clientVisible: boolean,
    signal: AbortSignal,
  ) =>
    request(path(projectId) + '/' + id + '/visibility', taskBoardSchema, {
      token,
      body: { version, clientVisible },
      signal,
    }),
  remove: (
    token: string,
    projectId: string,
    id: string,
    version: number,
    signal: AbortSignal,
  ) =>
    request(path(projectId) + '/' + id, taskBoardSchema, {
      token,
      method: 'DELETE',
      body: { version },
      signal,
    }),
};
export function taskError(cause: unknown) {
  if (cause instanceof ApiError) {
    const messages: Record<string, string> = {
      TASK_NOT_FOUND: 'المهمة مش موجودة في المشروع ده.',
      TASK_PROJECT_NOT_FOUND: 'المشروع مش موجود في مساحتك.',
      TASK_PROJECT_LOCKED:
        'المشروع اتقفل. اقرأ القائمة الحالية؛ المهام بقت للقراءة فقط.',
      TASK_CONFLICT:
        'المهام اتغيرت في مكان تاني. اقرأ القائمة الحالية قبل أي تعديل.',
      TASK_LIMIT_REACHED: 'وصلت لحد 200 مهمة في المشروع.',
      TASK_POSITION_INVALID: 'مكان النقل مش متاح. راجع ترتيب المهام الحالي.',
    };
    const message = messages[cause.code];
    if (message) return message;
  }
  return errorMessage(cause);
}
export function taskWriteBlocked(cause: unknown) {
  return (
    !(cause instanceof ApiError) ||
    cause.status === 0 ||
    cause.status >= 500 ||
    [
      'TASK_CONFLICT',
      'TASK_PROJECT_LOCKED',
      'TASK_NOT_FOUND',
      'TASK_PROJECT_NOT_FOUND',
      'TASK_POSITION_INVALID',
    ].includes(cause.code)
  );
}
