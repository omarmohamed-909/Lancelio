'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SessionProvider } from './session-provider';
import { WorkspaceAssistant } from '../../assistant/components/workspace-assistant';
export function SessionBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (
    pathname === '/' ||
    ['/legal', '/privacy', '/terms', '/cookies'].includes(pathname) ||
    pathname.startsWith('/share/') ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'
  )
    return children;
  return (
    <SessionProvider>
      {children}
      <WorkspaceAssistant />
    </SessionProvider>
  );
}
