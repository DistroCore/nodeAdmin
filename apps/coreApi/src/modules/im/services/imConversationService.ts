import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConnectionRegistry, SocketContext } from '../../../infrastructure/connectionRegistry';
import {
  ConversationRepository,
  type ConversationRow,
  type MemberRow,
} from '../../../infrastructure/database/conversationRepository';
import { StoredMessage } from '../../../infrastructure/inMemoryMessageStore';
import { ImMessageRepository } from '../../../infrastructure/database/imMessageRepository';
import { AuthIdentity } from '../../auth/authIdentity';

export interface JoinConversationResult {
  context: SocketContext;
  history: StoredMessage[];
  roomKey: string;
}

export interface CreateConversationResult {
  conversation: ConversationRow;
  members: MemberRow[];
}

@Injectable()
export class ImConversationService {
  constructor(
    private readonly connectionRegistry: ConnectionRegistry,
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: ImMessageRepository,
  ) {}

  async createConversation(params: {
    creatorId: string;
    memberUserIds: string[];
    tenantId: string;
    title?: string;
    type: 'dm' | 'group';
  }): Promise<CreateConversationResult> {
    const uniqueOtherMemberUserIds = Array.from(
      new Set(params.memberUserIds.map((memberUserId) => memberUserId.trim()).filter(Boolean)),
    ).filter((memberUserId) => memberUserId !== params.creatorId);

    if (params.type === 'dm' && uniqueOtherMemberUserIds.length !== 1) {
      throw new BadRequestException('Direct conversations must include exactly one other member.');
    }

    if (params.type === 'group' && uniqueOtherMemberUserIds.length < 1) {
      throw new BadRequestException('Group conversations must include at least one other member.');
    }

    const conversation = await this.conversationRepository.create({
      id: randomUUID(),
      tenantId: params.tenantId,
      type: params.type,
      title: params.type === 'group' ? this.normalizeTitle(params.title) : null,
      creatorId: params.creatorId,
      memberUserIds: uniqueOtherMemberUserIds,
    });

    const members = await this.conversationRepository.listMembers(params.tenantId, conversation.conversationId);

    return {
      conversation,
      members,
    };
  }

  async joinConversation(
    clientId: string,
    conversationId: string,
    identity: AuthIdentity,
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

  private normalizeTitle(title?: string): string | null {
    const trimmedTitle = title?.trim();
    return trimmedTitle ? trimmedTitle : null;
  }
}
