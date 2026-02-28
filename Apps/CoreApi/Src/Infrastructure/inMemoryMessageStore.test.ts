import { describe, expect, it } from 'vitest';
import { InMemoryMessageStore } from './inMemoryMessageStore';

function createMessage(messageId: string) {
  return {
    content: `content-${messageId}`,
    conversationId: 'conversation-1',
    createdAt: new Date().toISOString(),
    messageId,
    tenantId: 'tenant-1',
    traceId: `trace-${messageId}`,
    userId: 'user-1',
  };
}

describe('InMemoryMessageStore', () => {
  it('assigns increasing sequenceId values', () => {
    const store = new InMemoryMessageStore();

    const first = store.append(createMessage('m1'));
    const second = store.append(createMessage('m2'));

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    expect(first.message.sequenceId).toBe(1);
    expect(second.message.sequenceId).toBe(2);
  });

  it('returns duplicate metadata for repeated messageId', () => {
    const store = new InMemoryMessageStore();

    const first = store.append(createMessage('m1'));
    const duplicate = store.append(createMessage('m1'));

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.message.messageId).toBe(first.message.messageId);
    expect(duplicate.message.sequenceId).toBe(first.message.sequenceId);
  });

  it('returns latest messages with limit', () => {
    const store = new InMemoryMessageStore();

    store.append(createMessage('m1'));
    store.append(createMessage('m2'));
    store.append(createMessage('m3'));

    const latest = store.getLatest('tenant-1', 'conversation-1', 2);
    expect(latest).toHaveLength(2);
    expect(latest[0].messageId).toBe('m2');
    expect(latest[1].messageId).toBe('m3');
  });
});
