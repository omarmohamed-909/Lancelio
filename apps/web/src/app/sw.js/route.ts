import { createHash } from 'node:crypto';
import { offlineDocument } from '../../features/pwa/offline-document';
import { workerSource } from '../../features/pwa/worker-source';

export const dynamic = 'force-static';

export function GET() {
  const revision =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    createHash('sha256')
      .update(offlineDocument + workerSource)
      .digest('hex')
      .slice(0, 12);
  return new Response(
    `const CACHE_NAME = ${JSON.stringify(`lancelio-offline-${revision}`)};\n${workerSource}`,
    {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Service-Worker-Allowed': '/',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; connect-src 'self'",
      },
    },
  );
}
