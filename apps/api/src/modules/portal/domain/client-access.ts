export interface ClientAccess {
  id: string;
  version: number;
  email: string;
  workspaceName: string;
  clientName: string;
  state: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
  expiresAt: Date;
}
export interface AccessIdentity {
  userId: string;
  workspaceId: string;
  role: string;
}
