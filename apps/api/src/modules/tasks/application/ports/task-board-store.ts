import type {
  Task,
  StoredTaskBoard,
  TaskProjectStatus,
} from '../../domain/task-board.js';
export interface TaskBoardStore {
  find(workspaceId: string, projectId: string): Promise<StoredTaskBoard | null>;
  save(
    workspaceId: string,
    projectId: string,
    version: number,
    tasks: Task[],
  ): Promise<StoredTaskBoard | null>;
}
export interface TaskProjectDirectory {
  read(
    workspaceId: string,
    projectId: string,
  ): Promise<TaskProjectStatus | null>;
  reserve(
    workspaceId: string,
    projectId: string,
  ): Promise<TaskProjectStatus | null>;
}
export interface TaskTransactionContext {
  boards: TaskBoardStore;
  projects: TaskProjectDirectory;
}
export interface TaskTransactions {
  execute<T>(
    action: (context: TaskTransactionContext) => Promise<T>,
  ): Promise<T>;
}
