import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, UseGuards, ValidationPipe } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { Server, Socket } from 'socket.io';
import { runtimeConfig } from '../../App/runtimeConfig';
import { AuditLogService } from '../../Infrastructure/Audit/auditLogService';
import { AuthIdentity } from '../Auth/authIdentity';
import { JoinConversationDto } from './dto/joinConversationDto';
import { SendMessageDto } from './dto/sendMessageDto';
import { TypingStatusDto } from './dto/typingStatusDto';
import { WsTenantGuard } from './Guards/wsTenantGuard';
import { ImConversationService } from './services/imConversationService';
import { ImMessageService } from './services/imMessageService';
import { ImPresenceService } from './services/imPresenceService';

@WebSocketGateway({
  cors: {
    credentials: true,
    origin: runtimeConfig.corsOrigins,
  },
  maxHttpBufferSize: ImMessageService.maxMessageBytes,
  perMessageDeflate: false,
  pingInterval: 30000,
  pingTimeout: 25000,
  transports: ['websocket'],
})
export class ImGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(ImGateway.name);

  private redisPubClient: RedisClientType | null = null;
  private redisSubClient: RedisClientType | null = null;

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly conversationService: ImConversationService,
    private readonly messageService: ImMessageService,
    private readonly presenceService: ImPresenceService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async afterInit(server: Server): Promise<void> {
    if (!runtimeConfig.redis.url) {
      return;
    }

    try {
      this.redisPubClient = createClient({
        url: runtimeConfig.redis.url,
      });
      this.redisSubClient = this.redisPubClient.duplicate();

      await this.redisPubClient.connect();
      await this.redisSubClient.connect();

      server.adapter(createAdapter(this.redisPubClient, this.redisSubClient));
      this.logger.log(`Socket.IO Redis adapter connected: ${runtimeConfig.redis.url}`);
    } catch (error) {
      this.logger.error(`Failed to initialize Socket.IO Redis adapter: ${String(error)}`);
      await this.closeRedisClients();
    }
  }

  handleConnection(client: Socket): void {
    client.emit('serverReady', {
      clientId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket): void {
    // Capture context before removing so we can broadcast the leave event.
    const context = this.conversationService.getContext(client.id);
    this.conversationService.removeConnection(client.id);

    if (context) {
      const roomKey = this.conversationService.toRoomKey(context.tenantId, context.conversationId);
      // Notify remaining room members that this user has left.
      this.server.to(roomKey).emit('presenceChanged', this.presenceService.createLeftEvent(context));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeSocketServer();
    await this.closeRedisClients();
  }

  @SubscribeMessage('joinConversation')
  @UseGuards(WsTenantGuard)
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody(
      new ValidationPipe({
        exceptionFactory: (errors) => new WsException(errors),
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    )
    payload: JoinConversationDto,
  ): Promise<{ ok: true; roomKey: string }> {
    const identity = this.requireIdentity(client);
    const result = await this.conversationService.joinConversation(client.id, payload.conversationId, identity);

    client.join(result.roomKey);

    client.emit('conversationHistory', result.history);

    this.server.to(result.roomKey).emit('presenceChanged', this.presenceService.createJoinedEvent(result.context));

    void this.auditLogService.record({
      action: 'im.join_conversation',
      context: {
        conversationId: payload.conversationId,
      },
      targetId: payload.conversationId,
      targetType: 'conversation',
      tenantId: identity.tenantId,
      traceId: `${Date.now()}-${client.id}`,
      userId: identity.userId,
    });

    return {
      ok: true,
      roomKey: result.roomKey,
    };
  }

  @SubscribeMessage('sendMessage')
  @UseGuards(WsTenantGuard)
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody(
      new ValidationPipe({
        exceptionFactory: (errors) => new WsException(errors),
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    )
    payload: SendMessageDto,
  ): Promise<{ accepted: true; duplicate: boolean; messageId: string; sequenceId: number }> {
    const startTime = Date.now();

    try {
      const identity = this.requireIdentity(client);
      const context = this.conversationService.getContext(client.id);
      if (!context) {
        throw new WsException('Please join a conversation before sending messages.');
      }

      const appendResult = await this.messageService.appendMessage(context, payload, identity);
      const sequenceId = appendResult.message.sequenceId;

      if (!appendResult.duplicate) {
        const roomKey = this.conversationService.toRoomKey(context.tenantId, context.conversationId);
        client.to(roomKey).emit('messageReceived', appendResult.message);
        client.emit('messageReceived', appendResult.message);
      }

      void this.auditLogService.record({
        action: appendResult.duplicate ? 'im.send_message_duplicate' : 'im.send_message',
        context: {
          conversationId: context.conversationId,
          messageId: payload.messageId,
          sequenceId,
        },
        targetId: payload.messageId,
        targetType: 'message',
        tenantId: identity.tenantId,
        traceId: payload.traceId,
        userId: identity.userId,
      });

      return {
        accepted: true,
        messageId: payload.messageId,
        duplicate: appendResult.duplicate,
        sequenceId,
      };
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 100) {
        this.logger.warn(
          `sendMessage slow path: ${duration}ms messageId=${payload.messageId} conversationId=${payload.conversationId}`,
        );
      }
    }
  }

  @SubscribeMessage('typing')
  @UseGuards(WsTenantGuard)
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody(
      new ValidationPipe({
        exceptionFactory: (errors) => new WsException(errors),
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    )
    payload: TypingStatusDto,
  ): { ok: true } {
    const identity = this.requireIdentity(client);
    const context = this.conversationService.getContext(client.id);
    if (!context || context.conversationId !== payload.conversationId) {
      throw new WsException('Please join the matching conversation before sending typing events.');
    }

    const roomKey = this.conversationService.toRoomKey(context.tenantId, context.conversationId);
    client.to(roomKey).emit('typingChanged', {
      conversationId: context.conversationId,
      isTyping: payload.isTyping,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });

    return { ok: true };
  }

  private requireIdentity(client: Socket): AuthIdentity {
    const identity = client.data.identity as AuthIdentity | undefined;

    if (!identity || !identity.tenantId || !identity.userId) {
      throw new WsException('Missing socket identity.');
    }

    return identity;
  }

  private async closeRedisClients(): Promise<void> {
    if (this.redisPubClient) {
      await this.redisPubClient.quit();
      this.redisPubClient = null;
    }

    if (this.redisSubClient) {
      await this.redisSubClient.quit();
      this.redisSubClient = null;
    }
  }

  private async closeSocketServer(): Promise<void> {
    if (!this.server) {
      return;
    }

    await this.server.close();
  }
}
