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

  describe('updateContent', () => {
    it('updates content and sets editedAt', () => {
      const store = new InMemoryMessageStore();
      store.append(createMessage('m1'));

      const updated = store.updateContent('tenant-1', 'conversation-1', 'm1', 'new content');

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe('new content');
      expect(updated!.editedAt).not.toBeNull();
    });

    it('returns null for unknown message', () => {
      const store = new InMemoryMessageStore();

      const result = store.updateContent('tenant-1', 'conversation-1', 'm99', 'x');
      expect(result).toBeNull();
    });

    it('returns null without changing content after the message is deleted', () => {
      const store = new InMemoryMessageStore();
      store.append(createMessage('m1'));
      store.softDelete('tenant-1', 'conversation-1', 'm1');

      const updated = store.updateContent('tenant-1', 'conversation-1', 'm1', 'restored content');

      expect(updated).toBeNull();
      expect(store.findById('tenant-1', 'm1')).toMatchObject({ content: '', editedAt: null });
    });
  });

  describe('softDelete', () => {
    it('clears content and sets deletedAt', () => {
      const store = new InMemoryMessageStore();
      store.append(createMessage('m1'));

      const deleted = store.softDelete('tenant-1', 'conversation-1', 'm1');

      expect(deleted).not.toBeNull();
      expect(deleted!.content).toBe('');
      expect(deleted!.deletedAt).not.toBeNull();
    });

    it('returns null for unknown message', () => {
      const store = new InMemoryMessageStore();

      const result = store.softDelete('tenant-1', 'conversation-1', 'm99');
      expect(result).toBeNull();
    });

    it('returns null when the same message is deleted twice', () => {
      const store = new InMemoryMessageStore();
      store.append(createMessage('m1'));

      const firstDelete = store.softDelete('tenant-1', 'conversation-1', 'm1');
      const secondDelete = store.softDelete('tenant-1', 'conversation-1', 'm1');

      expect(firstDelete).not.toBeNull();
      expect(secondDelete).toBeNull();
      expect(store.findById('tenant-1', 'm1')?.deletedAt).toBe(firstDelete?.deletedAt);
    });
  });

  describe('findById', () => {
    it('returns the stored message by id within the tenant', () => {
      const store = new InMemoryMessageStore();
      store.append(createMessage('m1'));

      const found = store.findById('tenant-1', 'm1');

      expect(found).not.toBeNull();
      expect(found!.messageId).toBe('m1');
      expect(found!.tenantId).toBe('tenant-1');
    });

    it('returns null when the message id does not exist', () => {
      const store = new InMemoryMessageStore();
      store.append(createMessage('m1'));

      expect(store.findById('tenant-1', 'm99')).toBeNull();
    });

    it('scopes the lookup by tenant — does not cross tenant boundaries', () => {
      const store = new InMemoryMessageStore();
      store.append(createMessage('m1'));

      expect(store.findById('tenant-other', 'm1')).toBeNull();
    });
  });
});
