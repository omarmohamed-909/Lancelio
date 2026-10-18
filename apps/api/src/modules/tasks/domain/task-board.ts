import type { TaskProgress, ClientTaskView } from './task-progress.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from '../../../shared/domain/identifiers.js';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskProjectStatus =
  'active' | 'on_hold' | 'completed' | 'cancelled';
export interface TaskInput {
  title: string;
  description: string;
  priority: string;
}
export interface TaskContent {
  title: string;
  description: string;
  priority: TaskPriority;
}
export interface Task extends TaskContent {
  id: string;
  status: TaskStatus;
  clientVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface TaskBoard {
  projectId: string;
  projectStatus: TaskProjectStatus;
  version: number;
  tasks: Task[];
  progress: TaskProgress;
  clientView: ClientTaskView;
}
export interface StoredTaskBoard {
  version: number;
  tasks: Task[];
}
export const taskLimit = 200;
export function validateTaskVersion(version: number) {
  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version >= Number.MAX_SAFE_INTEGER
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid task board version',
    );
  return version;
}
export function validateTaskStatus(status: string): TaskStatus {
  if (status === 'todo' || status === 'in_progress' || status === 'done')
    return status;
  throw new ApplicationError('VALIDATION_ERROR', 'Invalid task status');
}
export function validateTaskInput(input: TaskInput): TaskContent {
  const title = input.title.trim(),
    description = input.description.trim();
  if (
    Array.from(title).length < 2 ||
    Array.from(title).length > 120 ||
    Array.from(title).some(
      (char) => (char.codePointAt(0) ?? 0) < 32 || char.codePointAt(0) === 127,
    ) ||
    Array.from(description).length > 2000
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid task details');
  if (
    input.priority !== 'low' &&
    input.priority !== 'normal' &&
    input.priority !== 'high'
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid task priority');
  return { title, description, priority: input.priority };
}
export function requireTask(tasks: readonly Task[], id: string) {
  const task = tasks.find((task) => task.id === id);
  if (!task)
    throw new ApplicationError(
      'TASK_NOT_FOUND',
      'Task not found in this project',
    );
  return task;
}
export function moveTask(
  tasks: readonly Task[],
  id: string,
  status: TaskStatus,
  beforeTaskId: string | null,
  now: Date,
): Task[] {
  const current = requireTask(tasks, id);
  const rest = tasks.filter((task) => task.id !== id);
  if (beforeTaskId === id)
    throw new ApplicationError(
      'TASK_POSITION_INVALID',
      'A task cannot be its own anchor',
    );
  if (beforeTaskId !== null) {
    validateId(beforeTaskId);
    const anchor = rest.find((task) => task.id === beforeTaskId);
    if (!anchor || anchor.status !== status)
      throw new ApplicationError(
        'TASK_POSITION_INVALID',
        'Choose a task from the destination column',
      );
  }
  const moved = { ...current, status, updatedAt: now };
  if (beforeTaskId === null) return [...rest, moved];
  const index = rest.findIndex((task) => task.id === beforeTaskId);
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}

export function validateTaskProjectStatus(status: string): TaskProjectStatus {
  if (
    status === 'active' ||
    status === 'on_hold' ||
    status === 'completed' ||
    status === 'cancelled'
  )
    return status;
  throw new ApplicationError('VALIDATION_ERROR', 'Invalid task project status');
}
