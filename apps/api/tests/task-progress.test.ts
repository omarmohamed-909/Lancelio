import { describe, it, expect } from 'vitest';
import {
  taskProgress,
  clientTaskView,
} from '../src/modules/tasks/domain/task-progress.js';
import type {
  Task,
  TaskStatus,
} from '../src/modules/tasks/domain/task-board.js';
const task = (
  id: string,
  status: TaskStatus,
  clientVisible: boolean,
): Task => ({
  id,
  title: 'Task ' + id,
  description: 'Description ' + id,
  status,
  clientVisible,
  priority: 'high',
  createdAt: new Date(),
  updatedAt: new Date(),
});
describe('Defined task progress and client projection', () => {
  it.each([
    { statuses: [], percentage: null, done: 0 },
    { statuses: ['todo', 'in_progress'], percentage: 0, done: 0 },
    { statuses: ['todo', 'done', 'done'], percentage: 67, done: 2 },
    { statuses: ['done', 'done'], percentage: 100, done: 2 },
    {
      statuses: Array.from({ length: 200 }, (_, index) =>
        index === 0 ? 'todo' : 'done',
      ),
      percentage: 99,
      done: 199,
    },
    { statuses: ['done', 'in_progress', 'todo'], percentage: 33, done: 1 },
  ])(
    'calculates %j without treating empty work as zero or incomplete work as 100',
    ({ statuses, percentage, done }) => {
      expect(
        taskProgress(
          statuses.map((status) => ({ status: status as TaskStatus })),
        ),
      ).toEqual({ total: statuses.length, done, percentage });
    },
  );
  it('excludes private tasks, metadata and private denominators', () => {
    const view = clientTaskView([
      task('private', 'done', false),
      task('visible', 'todo', true),
    ]);
    expect(view).toEqual({
      progress: { total: 1, done: 0, percentage: 0 },
      tasks: [
        {
          title: 'Task visible',
          description: 'Description visible',
          status: 'todo',
        },
      ],
    });
    expect(JSON.stringify(view)).not.toContain('private');
  });
  it('preserves visible order, weights every task equally and does not mutate', () => {
    const tasks = [
      task('A', 'done', true),
      task('B', 'in_progress', false),
      { ...task('C', 'todo', true), priority: 'low' as const },
    ];
    const before = structuredClone(tasks);
    expect(clientTaskView(tasks).tasks.map((task) => task.title)).toEqual([
      'Task A',
      'Task C',
    ]);
    expect(clientTaskView(tasks).progress).toEqual({
      total: 2,
      done: 1,
      percentage: 50,
    });
    expect(tasks).toEqual(before);
  });
  it('defines empty visible work independently of private completion', () => {
    const tasks = [task('private', 'done', false)];
    expect(taskProgress(tasks)).toEqual({ total: 1, done: 1, percentage: 100 });
    expect(clientTaskView(tasks)).toEqual({
      progress: { total: 0, done: 0, percentage: null },
      tasks: [],
    });
  });
});
