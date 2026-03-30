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
import { createClient, createCluster, RedisClientType, RedisClusterType } from 'redis';
import { Server, Socket } from 'socket.io';
import { runtimeConfig } from '../../app/runtimeConfig';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { CircuitBreaker } from '../../infrastructure/resilience/circuitBreaker';
import {
  DegradationManager,
  DegradationFeature,
} from '../../infrastructure/resilience/degradationManager';
import { AuthIdentity } from '../auth/authIdentity';
import { JoinConversationDto } from './dto/joinConversationDto';
import { SendMessageDto } from './dto/sendMessageDto';
import { TypingStatusDto } from './dto/typingStatusDto';
import { EditMessageDto } from './dto/editMessageDto';
import { DeleteMessageDto } from './dto/deleteMessageDto';
import { MarkAsReadDto } from './dto/markAsReadDto';
import { PresenceStatusDto } from './dto/presenceStatusDto';
import { WsTenantGuard } from './guards/wsTenantGuard';
import { ImConversationService } from './services/imConversationService';
import { ImMessageService } from './services/imMessageService';
import { ImPresenceService } from './services/imPresenceService';
import { StoredMessage } from '../../infrastructure/inMemoryMessageStore';

@WebSocketGateway({
  cors: {
    credentials: true,
    origin: runtimeConfig.corsOrigins,
  },
  maxHttpBufferSize: ImMessageService.maxMessageBytes,
  perMessageDeflate: false,
  pingInterval: runtimeConfig.socketio.pingInterval,
  pingTimeout: runtimeConfig.socketio.pingTimeout,
  transports: ['websocket'],
})
export class ImGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy
{
  private readonly logger = new Logger(ImGateway.name);

  private redisPubClient: RedisPubSubClient | null = null;
  private redisSubClient: RedisPubSubClient | null = null;
  private redisPubPool: RedisPubSubClient[] = [];
  private redisSubPool: RedisPubSubClient[] = [];
  private static readonly REDIS_POOL_SIZE = 10;

  private readonly redisCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    halfOpenMaxAttempts: 3,
    name: 'redis-adapter',
    successThreshold: 2,
    timeout: 30000,
  });

  private readonly degradationManager = new DegradationManager();

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly conversationService: ImConversationService,
    private readonly messageService: ImMessageService,
    private readonly presenceService: ImPresenceService,
    private readonly auditLogService: AuditLogService
  ) {}

  async afterInit(server: Server): Promise<void> {
    if (!runtimeConfig.redis.url && runtimeConfig.redis.clusterNodes.length === 0) {
      this.logger.warn('Redis is not configured, running in single-node mode');
      return;
    }

    try {
      await this.redisCircuitBreaker.execute(async () => {
        const redisDefaults = {
          socket: {
            connectTimeout: runtimeConfig.redis.connectTimeout,
            keepAlive: true,
            noDelay: true,
            reconnectStrategy: (retries: number) => {
              if (retries > runtimeConfig.redis.maxRetries) {
                return new Error('Max Redis reconnection retries reached');
              }
              return Math.min(retries * 100, 3000);
            },
          },
          commandsQueueMaxLength: runtimeConfig.redis.commandsQueueMaxLength,
          enableOfflineQueue: true,
          maxRetriesPerRequest: 3,
          pingInterval: runtimeConfig.redis.pingInterval,
        };

        if (runtimeConfig.redis.clusterNodes.length > 0) {
          const clusterConfig = {
            defaults: redisDefaults,
            rootNodes: runtimeConfig.redis.clusterNodes.map((url) => ({ url })),
          };

          this.redisPubClient = createCluster(clusterConfig) as RedisPubSubClient;
          this.redisSubClient = createCluster(clusterConfig) as RedisPubSubClient;

          await this.redisPubClient.connect();
          await this.redisSubClient.connect();

          for (let i = 0; i < ImGateway.REDIS_POOL_SIZE; i++) {
            const pubClient = createCluster(clusterConfig) as RedisPubSubClient;
            const subClient = createCluster(clusterConfig) as RedisPubSubClient;
            await pubClient.connect();
            await subClient.connect();
            this.redisPubPool.push(pubClient);
            this.redisSubPool.push(subClient);
          }

          server.adapter(createAdapter(this.redisPubClient as any, this.redisSubClient as any));
          this.logger.log(
            `Socket.IO Redis cluster adapter connected with pool size ${ImGateway.REDIS_POOL_SIZE}: ${runtimeConfig.redis.clusterNodes.join(', ')}`
          );
          return;
        }

        const redisConfig = {
          ...redisDefaults,
          url: runtimeConfig.redis.url || undefined,
        };

        this.redisPubClient = createClient(redisConfig);
        this.redisSubClient = this.redisPubClient.duplicate();

        await this.redisPubClient.connect();
        await this.redisSubClient.connect();

        for (let i = 0; i < ImGateway.REDIS_POOL_SIZE; i++) {
          const pubClient = createClient(redisConfig);
          const subClient = pubClient.duplicate();
          await pubClient.connect();
          await subClient.connect();
          this.redisPubPool.push(pubClient as any);
          this.redisSubPool.push(subClient as any);
        }

        server.adapter(createAdapter(this.redisPubClient as any, this.redisSubClient as any));
        this.logger.log(
          `Socket.IO Redis adapter connected with pool size ${ImGateway.REDIS_POOL_SIZE}: ${runtimeConfig.redis.url}`
        );
      });
    } catch (error) {
      this.degradationManager.degrade(
        DegradationFeature.REDIS_ADAPTER,
        `Redis connection failed: ${error instanceof Error ? error.message : String(error)}`
      );
      this.logger.error(
        `Failed to initialize Socket.IO Redis adapter, degrading to single-node mode: ${String(error)}`
      );
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
      this.server
        .to(roomKey)
        .emit('presenceChanged', this.presenceService.createLeftEvent(context));
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
      })
    )
    payload: JoinConversationDto
  ): Promise<{ ok: true; roomKey: string }> {
    const identity = this.requireIdentity(client);
    const result = await this.conversationService.joinConversation(
      client.id,
      payload.conversationId,
      identity
    );

    client.join(result.roomKey);

    client.emit('conversationHistory', result.history);

    this.server
      .to(result.roomKey)
      .emit('presenceChanged', this.presenceService.createJoinedEvent(result.context));

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
      })
    )
    payload: SendMessageDto
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
        const roomKey = this.conversationService.toRoomKey(
          context.tenantId,
          context.conversationId
        );
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
          `sendMessage slow path: ${duration}ms messageId=${payload.messageId} conversationId=${payload.conversationId}`
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
      })
    )
    payload: TypingStatusDto
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

  @SubscribeMessage('editMessage')
  @UseGuards(WsTenantGuard)
  async editMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody(
      new ValidationPipe({
        exceptionFactory: (errors) => new WsException(errors),
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      })
    )
    payload: EditMessageDto
  ): Promise<{ ok: true; message: StoredMessage }> {
    const identity = this.requireIdentity(client);
    const context = this.conversationService.getContext(client.id);
    if (!context || context.conversationId !== payload.conversationId) {
      throw new WsException('Please join the matching conversation before editing messages.');
    }

    const updated = await this.messageService.editMessage(
      context,
      payload.messageId,
      payload.content,
      identity
    );

    const roomKey = this.conversationService.toRoomKey(context.tenantId, context.conversationId);
    this.server.to(roomKey).emit('messageEdited', updated);

    return { ok: true, message: updated };
  }

  @SubscribeMessage('deleteMessage')
  @UseGuards(WsTenantGuard)
  async deleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody(
      new ValidationPipe({
        exceptionFactory: (errors) => new WsException(errors),
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      })
    )
    payload: DeleteMessageDto
  ): Promise<{ ok: true; message: StoredMessage }> {
    const identity = this.requireIdentity(client);
    const context = this.conversationService.getContext(client.id);
    if (!context || context.conversationId !== payload.conversationId) {
      throw new WsException('Please join the matching conversation before deleting messages.');
    }

    const deleted = await this.messageService.deleteMessage(
      context,
      payload.messageId,
      identity
    );

    const roomKey = this.conversationService.toRoomKey(context.tenantId, context.conversationId);
    this.server.to(roomKey).emit('messageDeleted', deleted);

    return { ok: true, message: deleted };
  }

  @SubscribeMessage('markAsRead')
  @UseGuards(WsTenantGuard)
  async markAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody(
      new ValidationPipe({
        exceptionFactory: (errors) => new WsException(errors),
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      })
    )
    payload: MarkAsReadDto
  ): Promise<{ ok: true }> {
    const identity = this.requireIdentity(client);
    const context = this.conversationService.getContext(client.id);
    if (!context || context.conversationId !== payload.conversationId) {
      throw new WsException('Please join the matching conversation before marking as read.');
    }

    const receipt = await this.messageService.markAsRead(
      context,
      payload.lastReadMessageId,
      identity
    );

    const roomKey = this.conversationService.toRoomKey(context.tenantId, context.conversationId);
    this.server.to(roomKey).emit('readReceiptUpdated', receipt);

    return { ok: true };
  }

  @SubscribeMessage('setPresenceStatus')
  @UseGuards(WsTenantGuard)
  setPresenceStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody(
      new ValidationPipe({
        exceptionFactory: (errors) => new WsException(errors),
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      })
    )
    payload: PresenceStatusDto
  ): { ok: true } {
    this.requireIdentity(client);
    const context = this.conversationService.getContext(client.id);
    if (!context) {
      throw new WsException('Please join a conversation before setting presence status.');
    }

    const event = this.presenceService.setStatus(
      context.tenantId,
      context.conversationId,
      context.userId,
      payload.status
    );

    const roomKey = this.conversationService.toRoomKey(context.tenantId, context.conversationId);
    this.server.to(roomKey).emit('presenceStatusChanged', event);

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

    for (const client of this.redisPubPool) {
      await client.quit();
    }
    this.redisPubPool = [];

    for (const client of this.redisSubPool) {
      await client.quit();
    }
    this.redisSubPool = [];
  }

  private async closeSocketServer(): Promise<void> {
    if (!this.server) {
      return;
    }

    await this.server.close();
  }
}

type RedisPubSubClient = RedisClientType | RedisClusterType;
