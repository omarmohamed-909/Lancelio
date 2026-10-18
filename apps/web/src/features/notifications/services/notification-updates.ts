import type { Notification } from '../schemas/notifications';

// Keep the watermark across workspace page navigation, scoped to this session
// and identity. Read/unread changes never create a new event.
const trackers = new WeakMap<
  object,
  Map<string, ReturnType<typeof createTracker>>
>();

function createTracker() {
  let initialized = false;
  let latestAt = -Infinity;
  let latestIds = new Set<string>();
  return (items: Notification[]) => {
    const hasNewUnread =
      initialized &&
      items.some((item) => {
        const at = Date.parse(item.occurredAt);
        return (
          !item.read &&
          (at > latestAt || (at === latestAt && !latestIds.has(item.id)))
        );
      });
    for (const item of items) {
      const at = Date.parse(item.occurredAt);
      if (at > latestAt || (at === latestAt && !latestIds.has(item.id))) {
        if (at > latestAt) {
          latestAt = at;
          latestIds = new Set();
        }
        latestIds.add(item.id);
      }
    }
    initialized = true;
    return hasNewUnread;
  };
}

export function notificationUpdatesFor(session: object, identity: string) {
  let identities = trackers.get(session);
  if (!identities) {
    identities = new Map();
    trackers.set(session, identities);
  }
  let tracker = identities.get(identity);
  if (!tracker) {
    tracker = createTracker();
    identities.set(identity, tracker);
  }
  return tracker;
}
