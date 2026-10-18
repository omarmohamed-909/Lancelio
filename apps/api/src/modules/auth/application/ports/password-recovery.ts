export interface RecoveryJob {
  readonly id: string;
  readonly payload: string;
  readonly lease: string;
  readonly expiresAt: Date;
}
export interface RecoverySecrets {
  create(email: string): { id: string; mailbox: string; payload: string };
  open(payload: string): { email: string; token: string };
  digest(token: string): string | null;
  lease(): string;
}
export interface RecoveryStore {
  enqueue(
    job: { id: string; mailbox: string; payload: string },
    now: Date,
  ): Promise<void>;
  claim(lease: string, now: Date): Promise<RecoveryJob | null>;
  prepare(job: RecoveryJob, email: string, now: Date): Promise<boolean>;
  finish(job: RecoveryJob): Promise<void>;
  retry(job: RecoveryJob, now: Date): Promise<void>;
  canReset(id: string, now: Date): Promise<boolean>;
  reset(id: string, passwordHash: string, now: Date): Promise<boolean>;
}
export interface RecoveryMailer {
  send(email: string, token: string, deliveryId: string): Promise<void>;
}
