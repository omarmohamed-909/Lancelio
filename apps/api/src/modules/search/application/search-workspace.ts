import type { SearchReader } from './ports/search-reader.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
export class SearchWorkspace {
  constructor(private readonly reader: SearchReader) {}
  execute(workspaceId: string, query: string) {
    const text = query.trim();
    if (
      text.length < 2 ||
      text.length > 100 ||
      /[\u0000-\u001f\u007f]/u.test(text)
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Search requires 2–100 characters',
      );
    // Invoice numbers are stored with ASCII digits; accept Arabic and Persian input.
    const normalized = text
      .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 0x6f0));
    return this.reader.read(workspaceId, normalized);
  }
}
