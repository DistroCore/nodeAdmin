import { Injectable } from '@nestjs/common';
import { ConnectionRegistry, SocketContext } from '../../../infrastructure/connectionRegistry';
import { StoredMessage } from '../../../infrastructure/inMemoryMessageStore';
import { ImMessageRepository } from '../../../infrastructure/database/imMessageRepository';
import { AuthIdentity } from '../../Auth/authIdentity';

export interface JoinConversationResult {
  context: SocketContext;
  history: StoredMessage[];
  roomKey: string;
}

@Injectable()
export class ImConversationService {
  constructor(
    private readonly connectionRegistry: ConnectionRegistry,
    private readonly messageRepository: ImMessageRepository
  ) {}

  async joinConversation(
    clientId: string,
    conversationId: string,
    identity: AuthIdentity
  ): Promise<JoinConversationResult> {
    const context: SocketContext = {
      conversationId,
      tenantId: identity.tenantId,
      userId: identity.userId,
    };

    const roomKey = this.toRoomKey(context.tenantId, context.conversationId);

    this.connectionRegistry.upsert(clientId, context);

    return {
      context,
      history: await this.messageRepository.getLatest(context.tenantId, context.conversationId, 50),
      roomKey,
    };
  }

  removeConnection(clientId: string): void {
    this.connectionRegistry.remove(clientId);
  }

  getContext(clientId: string): SocketContext | undefined {
    return this.connectionRegistry.get(clientId);
  }

  toRoomKey(tenantId: string, conversationId: string): string {
    return `${tenantId}::${conversationId}`;
  }
}
