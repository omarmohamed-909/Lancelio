import type { Connection } from 'mongoose';
import { ManageNotifications } from '../modules/notifications/application/manage-notifications.js';
import { MongoNotificationStore } from '../modules/notifications/infrastructure/mongo-notification-store.js';
import type { NotificationCollections } from '../modules/notifications/infrastructure/mongo-notification-store.js';
import { EncodedNotificationCursors } from '../modules/notifications/infrastructure/notification-cursors.js';
import type { NotificationStateModel } from '../modules/notifications/infrastructure/notification-state-model.js';
export function createNotifications(
  database: Connection,
  states: NotificationStateModel,
  collections: NotificationCollections,
  now: () => Date = () => new Date(),
) {
  return new ManageNotifications(
    new MongoNotificationStore(database, states, collections),
    new EncodedNotificationCursors(),
    now,
  );
}
