import { Schema } from 'mongoose';
import type { WelcomeLanguage } from '../application/ports/welcome-email.js';

export const welcomeEmailSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ['signup', 'existing'],
      default: 'signup',
      required: true,
    },
    state: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      required: true,
    },
    name: { type: String, required: true },
    email: { type: String, required: true },
    workspaceName: { type: String, required: true },
    language: { type: String, enum: ['ar', 'en'], required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    nextAttemptAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lease: { type: String, default: null },
    leasedUntil: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  { _id: false, strict: 'throw' },
);

export function newWelcomeEmail(
  name: string,
  email: string,
  workspaceName: string,
  language: WelcomeLanguage,
  now: Date,
  kind: 'signup' | 'existing' = 'signup',
) {
  return {
    kind,
    state: 'pending' as const,
    name,
    email,
    workspaceName,
    language,
    createdAt: now,
    nextAttemptAt: now,
    // All retries stay inside Resend's 24-hour idempotency window.
    expiresAt: new Date(now.getTime() + 23 * 60 * 60 * 1000),
  };
}
