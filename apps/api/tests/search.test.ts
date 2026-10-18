import { describe, it, expect, vi } from 'vitest';
import { SearchWorkspace } from '../src/modules/search/application/search-workspace.js';
describe('Workspace search query boundary', () => {
  it.each(['', ' ', 'a', 'x'.repeat(101), '\u0000x'])(
    'rejects invalid queries without reading data: %j',
    async (query) => {
      const read = vi.fn(async () => []);
      expect(() =>
        new SearchWorkspace({ read }).execute('workspace', query),
      ).toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it('normalizes invoice digits and preserves literal query characters', async () => {
    const read = vi.fn(async () => []);
    await new SearchWorkspace({ read }).execute('workspace', '  INV-١۲۳.*  ');
    expect(read).toHaveBeenCalledWith('workspace', 'INV-123.*');
  });
});
