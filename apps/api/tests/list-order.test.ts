import { describe, expect, it } from 'vitest';
import { validateListOrder } from '../src/shared/domain/list-order.js';
import { validateClientList } from '../src/modules/clients/domain/client-list.js';
import { validateProjectList } from '../src/modules/projects/domain/project.js';

describe('List ordering boundary', () => {
  it('preserves the existing order by default and accepts oldest first', () => {
    expect(validateListOrder()).toBe('newest');
    expect(
      validateClientList({ archived: true, contact: 'phone', order: 'oldest' }),
    ).toMatchObject({ archived: true, contact: 'phone', order: 'oldest' });
    expect(
      validateProjectList({ status: 'completed', order: 'oldest' }),
    ).toMatchObject({ status: 'completed', order: 'oldest' });
  });
  it.each(['', 'ascending', '$gt', 'oldest,newest'])(
    'rejects unsupported ordering before reading data: %s',
    (order) => {
      expect(() => validateListOrder(order)).toThrow('Invalid list order');
      expect(() => validateClientList({ archived: false, order })).toThrow();
      expect(() => validateProjectList({ order })).toThrow();
    },
  );
});
