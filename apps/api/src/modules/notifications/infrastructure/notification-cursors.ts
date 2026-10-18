import type { NotificationCursors } from '../application/ports/notification-store.js';
import type { NotificationCursor } from '../domain/notification.js';
import { validateNotificationId } from '../domain/notification.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
export class EncodedNotificationCursors implements NotificationCursors {
  encode(value: NotificationCursor) {
    return Buffer.from(
      JSON.stringify({ at: value.at.toISOString(), id: value.id }),
    ).toString('base64url');
  }
  decode(value: string): NotificationCursor {
    try {
      if (
        !/^[A-Za-z0-9_-]{1,300}$/u.test(value) ||
        Buffer.from(value, 'base64url').toString('base64url') !== value
      )
        throw new Error('Invalid cursor');
      const decoded: unknown = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      );
      if (
        !decoded ||
        typeof decoded !== 'object' ||
        !('at' in decoded) ||
        !('id' in decoded) ||
        Object.keys(decoded).length !== 2 ||
        typeof decoded.at !== 'string' ||
        typeof decoded.id !== 'string'
      )
        throw new Error('Invalid cursor');
      const at = new Date(decoded.at);
      if (at.toISOString() !== decoded.at) throw new Error('Invalid date');
      return { at, id: validateNotificationId(decoded.id) };
    } catch {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Invalid notification cursor',
      );
    }
  }
}
