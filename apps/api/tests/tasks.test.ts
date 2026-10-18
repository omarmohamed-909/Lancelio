import { ApplicationError } from '../src/shared/domain/application-error.js';
import { describe, it, expect } from 'vitest';
import {
  moveTask,
  validateTaskInput,
  validateTaskStatus,
  validateTaskVersion,
} from '../src/modules/tasks/domain/task-board.js';
import type { Task } from '../src/modules/tasks/domain/task-board.js';
const ids = [
  '000000000000000000000001',
  '000000000000000000000002',
  '000000000000000000000003',
  '000000000000000000000004',
];
const now = new Date('2026-10-09T10:00:00Z');
const tasks: Task[] = ids.map((id, index) => ({
  id,
  title: 'Task ' + index,
  description: '',
  priority: 'normal',
  clientVisible: false,
  status: index === 1 ? 'in_progress' : 'todo',
  createdAt: now,
  updatedAt: now,
}));
describe('Task content and stable ordering', () => {
  it('normalizes bounded Unicode content', () => {
    expect(
      validateTaskInput({
        title: '  مهمة جديدة  ',
        description: '  وصف  ',
        priority: 'high',
      }),
    ).toEqual({ title: 'مهمة جديدة', description: 'وصف', priority: 'high' });
    expect(
      validateTaskInput({
        title: '😀'.repeat(120),
        description: 'x'.repeat(2000),
        priority: 'low',
      }).title,
    ).toBe('😀'.repeat(120));
  });
  it.each([
    { title: 'x' },
    { title: 'x'.repeat(121) },
    { title: 'a' + String.fromCharCode(0) + 'b' },
    { description: 'x'.repeat(2001) },
    { priority: 'urgent' },
  ])('rejects invalid content %j', (patch) => {
    expect(() =>
      validateTaskInput({
        title: 'Task',
        description: '',
        priority: 'normal',
        ...patch,
      }),
    ).toThrow('Invalid');
  });
  it.each([-1, 0.5, NaN, Number.MAX_SAFE_INTEGER, Infinity])(
    'rejects invalid board version %s',
    (version) => {
      expect(() => validateTaskVersion(version)).toThrow();
    },
  );
  it('accepts virtual-empty and persisted versions', () => {
    expect(validateTaskVersion(0)).toBe(0);
    expect(validateTaskVersion(5)).toBe(5);
    expect(() => validateTaskStatus('cancelled')).toThrow();
  });
  it('moves before an anchor while preserving other columns and input', () => {
    const moved = moveTask(tasks, ids[3]!, 'todo', ids[0]!, new Date());
    expect(
      moved.filter((task) => task.status === 'todo').map((task) => task.id),
    ).toEqual([ids[3], ids[0], ids[2]]);
    expect(moved.find((task) => task.id === ids[1])).toEqual(tasks[1]);
    expect(tasks.map((task) => task.id)).toEqual(ids);
  });
  it('appends to a new column and can reopen done work', () => {
    const moved = moveTask(tasks, ids[0]!, 'done', null, now);
    expect(moved.at(-1)?.status).toBe('done');
    expect(
      moveTask(moved, ids[0]!, 'todo', ids[2]!, now)
        .filter((task) => task.status === 'todo')
        .map((task) => task.id),
    ).toEqual([ids[0], ids[2], ids[3]]);
  });
  it.each([ids[0], ids[1], '000000000000000000000099'])(
    'rejects self, cross-column or missing anchor %s',
    (anchor) => {
      expect(() => moveTask(tasks, ids[0]!, 'todo', anchor!, now)).toThrow(
        ApplicationError,
      );
    },
  );
  it('rejects unknown tasks', () => {
    expect(() =>
      moveTask(tasks, '000000000000000000000099', 'todo', null, now),
    ).toThrow('Task not found');
  });
});
