import { describe, expect, it, vi } from 'vitest';
import { InMemoryMessageStore } from '../inMemoryMessageStore';
import { ImMessageRepository } from './imMessageRepository';

function createPendingMessage() {
  return {
    content: 'before edit',
    conversationId: 'conversation-1',
    createdAt: '2026-07-10T04:00:00.000Z',
    messageId: 'message-1',
    tenantId: 'tenant-1',
    traceId: 'trace-1',
    userId: 'user-1',
  };
}

describe('ImMessageRepository in-memory fallback', () => {
  it('resolves the stored conversation before editing or deleting by message id', async () => {
    const store = new InMemoryMessageStore();
    const repository = new ImMessageRepository(store, null);
    const updateContent = vi.spyOn(store, 'updateContent');
    const softDelete = vi.spyOn(store, 'softDelete');
    await repository.append(createPendingMessage());

    const updated = await repository.updateContent('tenant-1', 'message-1', 'after edit');
    const deleted = await repository.softDelete('tenant-1', 'message-1');

    expect(updateContent).toHaveBeenCalledWith('tenant-1', 'conversation-1', 'message-1', 'after edit');
    expect(softDelete).toHaveBeenCalledWith('tenant-1', 'conversation-1', 'message-1');
    expect(updated).toMatchObject({ conversationId: 'conversation-1', messageId: 'message-1' });
    expect(deleted).toMatchObject({ content: '', conversationId: 'conversation-1', messageId: 'message-1' });
    expect(deleted?.deletedAt).not.toBeNull();
  });

  it('does not edit or delete a message through another tenant', async () => {
    const store = new InMemoryMessageStore();
    const repository = new ImMessageRepository(store, null);
    await repository.append(createPendingMessage());

    await expect(repository.updateContent('tenant-2', 'message-1', 'tampered')).resolves.toBeNull();
    await expect(repository.softDelete('tenant-2', 'message-1')).resolves.toBeNull();
  });
});
