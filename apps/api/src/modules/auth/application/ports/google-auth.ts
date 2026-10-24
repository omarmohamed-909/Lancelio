export interface GoogleProfile {
  subject: string;
  email: string;
  name: string;
  emailAuthoritative: boolean;
}
export interface GoogleTokenVerifier {
  verify(credential: string, nonce: string, now: Date): Promise<GoogleProfile>;
}
export interface GoogleAccount {
  userId: string;
  subject: string | null;
  passwordHash: string | null;
  status: string;
  emailVerified: boolean;
}
export interface GoogleAccountStore {
  challenge(nonce: string, expiresAt: Date): Promise<void>;
  find(profile: GoogleProfile): Promise<GoogleAccount | null>;
  complete(input: {
    nonce: string;
    now: Date;
    profile: GoogleProfile;
    existing: GoogleAccount | null;
    name?: string;
    workspaceName?: string;
    locale?: 'ar' | 'en';
  }): Promise<{ userId: string; passwordHash: string | null }>;
}
