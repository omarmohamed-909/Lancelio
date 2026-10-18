import type { Task, TaskStatus } from './task-board.js';
export interface TaskProgress {
  total: number;
  done: number;
  percentage: number | null;
}
export interface ClientTaskView {
  progress: TaskProgress;
  tasks: { title: string; description: string; status: TaskStatus }[];
}
export function taskProgress(
  tasks: readonly Pick<Task, 'status'>[],
): TaskProgress {
  const total = tasks.length,
    done = tasks.filter((task) => task.status === 'done').length;
  return {
    total,
    done,
    percentage:
      total === 0
        ? null
        : done === total
          ? 100
          : Math.min(99, Math.round((done * 100) / total)),
  };
}
export function clientTaskView(tasks: readonly Task[]): ClientTaskView {
  const visible = tasks.filter((task) => task.clientVisible === true);
  return {
    progress: taskProgress(visible),
    tasks: visible.map(({ title, description, status }) => ({
      title,
      description,
      status,
    })),
  };
}
