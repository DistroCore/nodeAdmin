import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ConversationItem, ConversationMember } from '@nodeadmin/shared-types';
import {
  ConversationRepository,
  type ConversationRow,
  type MemberRow,
} from '../../infrastructure/database/conversationRepository';
import { CurrentUser } from '../auth/currentUser.decorator';
import type { AuthIdentity } from '../auth/authIdentity';
import { CreateConversationDto } from './dto/createConversationDto';
import { ImConversationService } from './services/imConversationService';

@ApiTags('im')
@ApiBearerAuth()
@Controller('im/conversations')
export class ImConversationController {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly conversationService: ImConversationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a conversation or return an existing DM' })
  async createConversation(
    @CurrentUser() identity: AuthIdentity,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationItem> {
    if (dto.type === 'dm') {
      const existingConversation = await this.conversationRepository.findDmBetweenUsers(
        identity.tenantId,
        identity.userId,
        dto.memberUserIds[0] ?? '',
      );

      if (existingConversation) {
        const existingMembers = await this.conversationRepository.listMembers(
          existingConversation.tenantId,
          existingConversation.conversationId,
        );

        return this.toConversationItem(existingConversation, existingMembers);
      }
    }

    const createdConversation = await this.conversationService.createConversation({
      creatorId: identity.userId,
      memberUserIds: dto.memberUserIds,
      tenantId: identity.tenantId,
      title: dto.title,
      type: dto.type,
    });

    return this.toConversationItem(createdConversation.conversation, createdConversation.members);
  }

  @Get()
  @ApiOperation({ summary: 'List conversations for the current user' })
  async listConversations(@CurrentUser() identity: AuthIdentity): Promise<{ rows: ConversationItem[] }> {
    const conversations = await this.conversationRepository.listByMember(identity.tenantId, identity.userId);
    const rows = await Promise.all(
      conversations.map(async (conversation) => {
        const members = await this.conversationRepository.listMembers(identity.tenantId, conversation.conversationId);
        return this.toConversationItem(conversation, members);
      }),
    );

    return { rows };
  }

  @Get('search-users')
  @ApiOperation({ summary: 'Search users within the current tenant for conversation creation' })
  async searchUsers(
    @CurrentUser() identity: AuthIdentity,
    @Query('q') query = '',
  ): Promise<{
    users: Array<{ avatar: string | null; email: string; id: string; name: string | null }>;
  }> {
    const users = await this.conversationRepository.searchUsers(identity.tenantId, query);
    return { users };
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List members of a conversation for an authorized member' })
  async listMembers(
    @CurrentUser() identity: AuthIdentity,
    @Param('id') conversationId: string,
  ): Promise<{ members: MemberRow[] }> {
    const conversation = await this.conversationRepository.findById(identity.tenantId, conversationId, identity.userId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const members = await this.conversationRepository.listMembers(identity.tenantId, conversationId);
    return { members };
  }

  private toConversationItem(conversation: ConversationRow, members: MemberRow[]): ConversationItem {
    return {
      id: conversation.conversationId,
      tenantId: conversation.tenantId,
      type: conversation.type,
      title: conversation.title,
      creatorId: conversation.creatorId,
      members: members.map(
        (member): ConversationMember => ({
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
        }),
      ),
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }
}
