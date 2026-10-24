export type WelcomeLanguage = 'ar' | 'en';
export interface WelcomeMessage {
  kind?: 'signup' | 'existing';
  name: string;
  email: string;
  workspaceName: string;
  language: WelcomeLanguage;
}
export interface WelcomeJob extends WelcomeMessage {
  userId: string;
  lease: string;
  attempts: number;
}
export interface WelcomeStore {
  claim(now: Date): Promise<WelcomeJob | null>;
  finish(job: WelcomeJob, now: Date): Promise<void>;
  fail(job: WelcomeJob, now: Date, retryable: boolean): Promise<void>;
}
export interface WelcomeMailer {
  send(message: WelcomeMessage, deliveryId: string): Promise<void>;
}
export class WelcomeDeliveryError extends Error {
  constructor(readonly retryable: boolean) {
    super('Welcome delivery failed');
  }
}
