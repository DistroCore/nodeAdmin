import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from '../useNotificationStore';

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ readIds: new Set<string>(), readBefore: null });
  });

  it('markAsRead marks a single id as read, others stay unread', () => {
    const { markAsRead } = useNotificationStore.getState();
    markAsRead('n-1');
    const { isRead } = useNotificationStore.getState();
    expect(isRead('n-1', '2026-01-01T00:00:00Z')).toBe(true);
    expect(isRead('n-2', '2026-01-01T00:00:00Z')).toBe(false);
  });

  it('isRead is false before any read action', () => {
    expect(useNotificationStore.getState().isRead('n-1', '2026-01-01T00:00:00Z')).toBe(false);
  });

  it('markAllAsRead sets a watermark covering entries up to now, including never-loaded ones', () => {
    const past = '2026-01-01T00:00:00Z';
    const future = new Date(Date.now() + 60_000).toISOString();
    useNotificationStore.getState().markAllAsRead();
    const { isRead } = useNotificationStore.getState();
    // An entry created before the watermark is read even though its id was never seen/loaded.
    expect(isRead('never-loaded', past)).toBe(true);
    // An entry created after the watermark remains unread.
    expect(isRead('arrives-later', future)).toBe(false);
  });
});
