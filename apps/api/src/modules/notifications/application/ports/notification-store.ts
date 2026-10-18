import type {
  Notification,
  NotificationCursor,
} from '../../domain/notification.js';
export interface NotificationStore {
  list(
    workspace: string,
    user: string,
    unreadOnly: boolean,
    cursor: NotificationCursor | null,
  ): Promise<{
    items: Notification[];
    unreadCount: number;
    next: NotificationCursor | null;
  }>;
  summary(workspace: string, user: string): Promise<number>;
  setRead(
    workspace: string,
    user: string,
    id: string,
    version: number,
    read: boolean,
    at: Date,
  ): Promise<
    | { status: 'missing' }
    | { status: 'conflict' }
    | { status: 'saved'; read: boolean; readAt: Date | null; version: number }
  >;
}
export interface NotificationCursors {
  encode(value: NotificationCursor): string;
  decode(value: string): NotificationCursor;
}
