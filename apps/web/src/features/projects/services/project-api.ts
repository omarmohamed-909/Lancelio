import type { ListOrder } from '../../../shared/schemas/list-order';
import { ApiError, request } from '../../../shared/api/http-client';
import { errorMessage } from '../../auth/services/auth-api';
import { projectPageSchema, projectSchema } from '../schemas/project';
import type { ManualProjectInput, ProjectStatus } from '../schemas/project';
export const projectApi = {
  read: (token: string, id: string, signal?: AbortSignal) =>
    request('/projects/' + id, projectSchema, {
      token,
      method: 'GET',
      ...(signal ? { signal } : {}),
    }),
  list: (
    token: string,
    status: ProjectStatus | 'all',
    cursor?: string,
    signal?: AbortSignal,
    order: ListOrder = 'newest',
  ) => {
    const query = new URLSearchParams({ status });
    if (order === 'oldest') query.set('order', order);
    if (cursor) query.set('cursor', cursor);
    return request('/projects?' + query, projectPageSchema, {
      token,
      method: 'GET',
      ...(signal ? { signal } : {}),
    });
  },
  create: (token: string, body: ManualProjectInput, signal: AbortSignal) =>
    request('/projects', projectSchema, { token, body, signal }),
  changeStatus: (
    token: string,
    id: string,
    version: number,
    status: ProjectStatus,
    signal: AbortSignal,
  ) =>
    request('/projects/' + id + '/status', projectSchema, {
      token,
      body: { version, status },
      signal,
    }),
};
export const projectStatusLabels: Record<ProjectStatus, string> = {
  active: 'نشط',
  on_hold: 'متوقف مؤقتًا',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};
export const projectTransitions: Record<
  ProjectStatus,
  readonly ProjectStatus[]
> = {
  active: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['active', 'cancelled'],
  completed: [],
  cancelled: [],
};
export function projectError(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.code === 'PROJECT_CLIENT_UNAVAILABLE')
      return 'العميل مش متاح. اختار عميل حالي من مساحتك.';
    if (cause.code === 'PROJECT_NOT_FOUND')
      return 'المشروع مش موجود في مساحتك.';
    if (cause.code === 'PROJECT_CONFLICT')
      return 'المشروع اتغير في مكان تاني. حمّل الحالة الحالية قبل أي تغيير.';
    if (cause.code === 'PROJECT_STATUS_INVALID')
      return 'تغيير الحالة ده مش متاح. راجع الحالة الحالية للمشروع.';
  }
  return errorMessage(cause);
}
export function uncertainProjectWrite(cause: unknown) {
  return (
    !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500
  );
}
