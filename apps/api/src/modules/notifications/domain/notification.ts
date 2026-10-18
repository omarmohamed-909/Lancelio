import { ApplicationError } from '../../../shared/domain/application-error.js';
export type NotificationKind =
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'invoice_issued'
  | 'payment_received'
  | 'payment_voided';
export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  occurredAt: Date;
  target: { type: 'proposal' | 'invoice'; id: string };
  read: boolean;
  readAt: Date | null;
  version: number;
}
export interface NotificationCursor {
  at: Date;
  id: string;
}
export interface NotificationPage {
  items: Notification[];
  unreadCount: number;
  nextCursor: string | null;
  asOf: Date;
}
export function validateNotificationId(id: string) {
  if (
    !/^(?:proposal:[a-f\d]{24}:(?:accepted|rejected)|invoice:[a-f\d]{24}:issued|payment:[a-f\d]{24}:[a-f\d]{24}:(?:received|voided))$/u.test(
      id,
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid notification id');
  return id;
}
export function validateNotificationVersion(version: number) {
  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version >= Number.MAX_SAFE_INTEGER
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid notification version',
    );
}
