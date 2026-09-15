import { Injectable } from '@nestjs/common';
import type { ImMessageType, MessageMetadata } from '@nodeadmin/shared-types';

export type { ImMessageType, MessageMetadata } from '@nodeadmin/shared-types';

export interface StoredMessage {
  content: string;
  conversationId: string;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  messageId: string;
  messageType: ImMessageType;
  metadata: MessageMetadata | null;
  sequenceId: number;
  tenantId: string;
  traceId: string;
  userId: string;
}

export type PendingMessage = Omit<
  StoredMessage,
  'messageType' | 'metadata' | 'sequenceId' | 'deletedAt' | 'editedAt'
> & {
  messageType?: ImMessageType;
  metadata?: MessageMetadata | null;
};

export interface AppendResult {
  duplicate: boolean;
  message: StoredMessage;
}

@Injectable()
export class InMemoryMessageStore {
  private static readonly maxStoredMessagesPerStream = 200;

  private readonly messagesByStream = new Map<string, StoredMessage[]>();
  private readonly messageByIdByStream = new Map<string, Map<string, StoredMessage>>();
  private readonly nextSequenceByStream = new Map<string, number>();

  append(message: PendingMessage): AppendResult {
    const streamKey = this.toStreamKey(message.tenantId, message.conversationId);
    const currentMessages = this.messagesByStream.get(streamKey) ?? [];
    const messageById = this.messageByIdByStream.get(streamKey) ?? new Map<string, StoredMessage>();

    const existingMessage = messageById.get(message.messageId);
    if (existingMessage) {
      return {
        duplicate: true,
        message: existingMessage,
      };
    }

    const currentSequence = this.nextSequenceByStream.get(streamKey) ?? 0;
    const storedMessage: StoredMessage = {
      ...message,
      deletedAt: null,
      editedAt: null,
      messageType: message.messageType ?? 'text',
      metadata: message.metadata ?? null,
      sequenceId: currentSequence + 1,
    };

    currentMessages.push(storedMessage);
    messageById.set(storedMessage.messageId, storedMessage);

    if (currentMessages.length > InMemoryMessageStore.maxStoredMessagesPerStream) {
      const removedMessage = currentMessages.shift();
      if (removedMessage) {
        messageById.delete(removedMessage.messageId);
      }
    }

    this.messagesByStream.set(streamKey, currentMessages);
    this.messageByIdByStream.set(streamKey, messageById);
    this.nextSequenceByStream.set(streamKey, storedMessage.sequenceId);

    return {
      duplicate: false,
      message: storedMessage,
    };
  }

  getLatest(tenantId: string, conversationId: string, limit: number): StoredMessage[] {
    const streamKey = this.toStreamKey(tenantId, conversationId);
    const currentMessages = this.messagesByStream.get(streamKey) ?? [];
    return currentMessages.slice(-limit);
  }

  /**
   * Look up a single message by id within a tenant. Used for ownership / sequence resolution in
   * edit/delete/markAsRead paths that must not be capped by the getLatest window.
   *
   * NOTE: in-memory mode caps each stream at {@link maxStoredMessagesPerStream} (200) and evicts the
   * oldest entry once exceeded. This is a structural limit of the dev fallback store and cannot be
   * bypassed here. Production runs against PostgreSQL where the repository path uses the
   * `(tenant_id, message_id)` unique index and is unbounded.
   */
  findById(tenantId: string, messageId: string): StoredMessage | null {
    // messageByIdByStream is keyed by `${tenantId}::${conversationId}`; messageId is unique per
    // tenant in practice (UUID), so scan the tenant's streams and return the first match.
    for (const [key, messageById] of this.messageByIdByStream.entries()) {
      if (!key.startsWith(`${tenantId}::`)) continue;
      const msg = messageById.get(messageId);
      if (msg && msg.tenantId === tenantId) return msg;
    }
    return null;
  }

  updateContent(tenantId: string, conversationId: string, messageId: string, content: string): StoredMessage | null {
    const streamKey = this.toStreamKey(tenantId, conversationId);
    const messageById = this.messageByIdByStream.get(streamKey);
    if (!messageById) return null;

    const msg = messageById.get(messageId);
    if (!msg || msg.deletedAt !== null) return null;

    msg.content = content;
    msg.editedAt = new Date().toISOString();
    return msg;
  }

  softDelete(tenantId: string, conversationId: string, messageId: string): StoredMessage | null {
    const streamKey = this.toStreamKey(tenantId, conversationId);
    const messageById = this.messageByIdByStream.get(streamKey);
    if (!messageById) return null;

    const msg = messageById.get(messageId);
    if (!msg || msg.deletedAt !== null) return null;

    msg.content = '';
    msg.deletedAt = new Date().toISOString();
    return msg;
  }

  private toStreamKey(tenantId: string, conversationId: string): string {
    return `${tenantId}::${conversationId}`;
  }
}
