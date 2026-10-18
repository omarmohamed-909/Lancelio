import { validateId } from '../../../shared/domain/identifiers.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import {
  validateNotificationId,
  validateNotificationVersion,
} from '../domain/notification.js';
import type {
  NotificationStore,
  NotificationCursors,
} from './ports/notification-store.js';
export class ManageNotifications {
  constructor(
    private readonly store: NotificationStore,
    private readonly cursors: NotificationCursors,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async list(
    workspace: string,
    user: string,
    unreadOnly: boolean,
    cursor: string | null,
  ) {
    const asOf = this.now();
    const page = await this.store.list(
      validateId(workspace),
      validateId(user),
      unreadOnly,
      cursor === null ? null : this.cursors.decode(cursor),
    );
    return {
      items: page.items,
      unreadCount: page.unreadCount,
      nextCursor: page.next ? this.cursors.encode(page.next) : null,
      asOf,
    };
  }
  async summary(workspace: string, user: string) {
    const asOf = this.now();
    return {
      unreadCount: await this.store.summary(
        validateId(workspace),
        validateId(user),
      ),
      asOf,
    };
  }
  async setRead(
    workspace: string,
    user: string,
    id: string,
    version: number,
    read: boolean,
  ) {
    validateNotificationVersion(version);
    const result = await this.store.setRead(
      validateId(workspace),
      validateId(user),
      validateNotificationId(id),
      version,
      read,
      this.now(),
    );
    if (result.status === 'missing')
      throw new ApplicationError(
        'NOTIFICATION_NOT_FOUND',
        'Notification not found',
      );
    if (result.status === 'conflict')
      throw new ApplicationError(
        'NOTIFICATION_CONFLICT',
        'Notification changed; read current state',
      );
    return {
      id,
      read: result.read,
      readAt: result.readAt,
      version: result.version,
    };
  }
}
