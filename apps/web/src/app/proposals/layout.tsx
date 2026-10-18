import type { ReactNode } from 'react';
import { WorkspaceShell } from '../../features/workspace/components/workspace-shell';
export default function ProposalsLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
