import { createHash } from 'node:crypto';
import {
  offlineDocument,
  offlineScript,
} from '../../features/pwa/offline-document';

export const dynamic = 'force-static';

export function GET() {
  const hash = createHash('sha256').update(offlineScript).digest('base64');
  return new Response(offlineDocument, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Content-Security-Policy': `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
