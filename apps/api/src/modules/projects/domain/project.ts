import type { Currency } from '../../../shared/domain/money.js';
import { validateListOrder } from '../../../shared/domain/list-order.js';
import type { ListOrder } from '../../../shared/domain/list-order.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from '../../../shared/domain/identifiers.js';
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';
export interface ProjectClient {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
}
export interface ProjectItem {
  title: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}
export interface AcceptedProjectInput {
  workspaceId: string;
  sourceProposalId: string;
  title: string;
  summary: string;
  terms: string;
  currency: Currency;
  items: ProjectItem[];
  totalMinor: number;
  client: ProjectClient;
  acceptedAt: Date;
}
export interface ManualProjectInput {
  clientId: string;
  title: string;
  summary: string;
}
export interface Project {
  id: string;
  origin: 'proposal' | 'manual';
  sourceProposalId: string | null;
  title: string;
  summary: string;
  terms: string;
  currency: Currency | null;
  items: ProjectItem[];
  totalMinor: number | null;
  client: ProjectClient;
  acceptedAt: Date | null;
  status: ProjectStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
export type ProjectSummary = Pick<
  Project,
  | 'id'
  | 'origin'
  | 'sourceProposalId'
  | 'title'
  | 'client'
  | 'status'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
>;
export interface ProjectPage {
  items: ProjectSummary[];
  nextCursor: string | null;
}
export interface ProjectListInput {
  order?: string | undefined;
  status?: string | undefined;
  cursor?: string | undefined;
}
export interface ProjectListQuery {
  order: ListOrder;
  status: ProjectStatus | 'all';
  cursor?: string;
}
export function validateProjectStatus(value: string): ProjectStatus {
  if (
    value === 'active' ||
    value === 'on_hold' ||
    value === 'completed' ||
    value === 'cancelled'
  )
    return value;
  throw new ApplicationError('VALIDATION_ERROR', 'Invalid project status');
}
export function validateManualProject(
  input: ManualProjectInput,
): ManualProjectInput {
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (
    Array.from(title).length < 2 ||
    Array.from(title).length > 120 ||
    Array.from(title).some((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point < 32 || point === 127;
    }) ||
    Array.from(summary).length > 3000
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid project details');
  return { clientId: validateId(input.clientId), title, summary };
}
export function validateProjectList(input: ProjectListInput): ProjectListQuery {
  const status = input.status ?? 'all';
  return {
    status: status === 'all' ? status : validateProjectStatus(status),
    order: validateListOrder(input.order),
    ...(input.cursor === undefined ? {} : { cursor: validateId(input.cursor) }),
  };
}
export function assertProjectTransition(
  current: ProjectStatus,
  next: ProjectStatus,
) {
  const allowed: Record<ProjectStatus, readonly ProjectStatus[]> = {
    active: ['on_hold', 'completed', 'cancelled'],
    on_hold: ['active', 'cancelled'],
    completed: [],
    cancelled: [],
  };
  if (!allowed[current].includes(next))
    throw new ApplicationError(
      'PROJECT_STATUS_INVALID',
      'This project status transition is not allowed',
    );
}
