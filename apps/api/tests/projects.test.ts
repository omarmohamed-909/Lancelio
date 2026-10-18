import { describe, expect, it } from 'vitest';
import {
  assertProjectTransition,
  validateManualProject,
  validateProjectList,
  validateProjectStatus,
} from '../src/modules/projects/domain/project.js';
import type { ProjectStatus } from '../src/modules/projects/domain/project.js';
const id = '0123456789abcdef01234567';
describe('Project rules', () => {
  it('normalizes manual details and constrains client references', () => {
    expect(
      validateManualProject({
        clientId: id.toUpperCase(),
        title: '  شغل جديد  ',
        summary: '  وصف  ',
      }),
    ).toEqual({ clientId: id, title: 'شغل جديد', summary: 'وصف' });
  });
  it.each([
    { title: 'x' },
    { title: 'x'.repeat(121) },
    { title: 'bad' + String.fromCharCode(0) },
    { summary: 'x'.repeat(3001) },
    { clientId: 'foreign-format' },
  ])('rejects invalid manual content %j', (patch) => {
    expect(() =>
      validateManualProject({
        clientId: id,
        title: 'مشروع جديد',
        summary: '',
        ...patch,
      }),
    ).toThrow('Invalid');
  });
  it('accepts bounded Unicode names and multiline summaries', () => {
    expect(
      validateManualProject({
        clientId: id,
        title: 'ع'.repeat(120),
        summary: 'سطر أول' + String.fromCharCode(10) + 'سطر تاني',
      }).title,
    ).toHaveLength(120);
  });
  const states: ProjectStatus[] = [
    'active',
    'on_hold',
    'completed',
    'cancelled',
  ];
  const valid = new Set([
    'active:on_hold',
    'active:completed',
    'active:cancelled',
    'on_hold:active',
    'on_hold:cancelled',
  ]);
  for (const from of states)
    for (const to of states)
      it(from + ' → ' + to, () => {
        if (valid.has(from + ':' + to))
          expect(() => assertProjectTransition(from, to)).not.toThrow();
        else
          expect(() => assertProjectTransition(from, to)).toThrow(
            'not allowed',
          );
      });
  it('validates list filters and cursor', () => {
    expect(validateProjectList({})).toEqual({ status: 'all', order: 'newest' });
    expect(
      validateProjectList({ status: 'completed', cursor: id.toUpperCase() }),
    ).toEqual({ status: 'completed', cursor: id, order: 'newest' });
    expect(() => validateProjectList({ status: 'unknown' })).toThrow();
    expect(() => validateProjectList({ cursor: 'invalid' })).toThrow();
    expect(() => validateProjectStatus('draft')).toThrow();
  });
});
