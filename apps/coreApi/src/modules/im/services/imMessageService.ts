import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import { WsException } from '@nestjs/websockets';
import { runtimeConfig } from '../../../app/runtimeConfig';
import { SocketContext } from '../../../infrastructure/connectionRegistry';
import {
  AppendResult,
  PendingMessage,
  StoredMessage,
} from '../../../infrastructure/inMemoryMessageStore';
import { ImMessageRepository } from '../../../infrastructure/database/imMessageRepository';
import { AuthIdentity } from '../../Auth/authIdentity';
import { SendMessageDto } from '../dto/sendMessageDto';
import { BackpressureController } from '../../../infrastructure/resilience/backpressureController';

interface RateLimitWindow {
  count: number;
  windowStartedAt: number;
}

interface CachedAppendResult {
  cachedAtMs: number;
  persisted: boolean;
  result: AppendResult;
}

interface PersistQueueEntry {
  enqueuedAtMs: number;
  message: PendingMessage;
  streamKey: string;
}

@Injectable()
export class ImMessageService implements OnModuleInit, OnModuleDestroy {
  static readonly maxMessageBytes = 1024 * 1024;
  private static readonly persistBatchFlushIntervalMs = 50;
  private static readonly persistBatchSize = 200;
  private static readonly persistConcurrency = 20;
  private static readonly persistMaxRetry = 3;
  private static readonly persistRetryDelayMs = 50;
  private static readonly maxPersistQueueLength = 50000;
  private static readonly duplicateCacheTtlMs = 5 * 60 * 1000;
  private static readonly duplicateCacheMaxPerStream = 512;
  private static readonly streamStateTtlMs = 15 * 60 * 1000;
  private static readonly streamStateCleanupIntervalMs = 60 * 1000;
  private static readonly queueWarnThreshold = 5000;
  private static readonly queueWarnIntervalMs = 5000;
  private static readonly meter = metrics.getMeter('core-api-im');
  private static readonly tracer = trace.getTracer('core-api-im');
  private static readonly appendedCounter = ImMessageService.meter.createCounter(
    'im_messages_appended_total',
    {
      description: 'Total IM messages accepted by the server.',
    }
  );
  private static readonly appendDurationMs = ImMessageService.meter.createHistogram(
    'im_message_append_ms',
    {
      description: 'Latency of append pipeline for IM messages.',
      unit: 'ms',
    }
  );
  private static readonly appendAckDurationMs = ImMessageService.meter.createHistogram(
    'im_message_ack_ms',
    {
      description: 'Latency from message receive to ACK.',
      unit: 'ms',
    }
  );
  private static readonly persistQueueWaitDurationMs = ImMessageService.meter.createHistogram(
    'im_message_persist_queue_wait_ms',
    {
      description: 'Time spent waiting in persistence queue.',
      unit: 'ms',
    }
  );
  private static readonly persistDbWriteDurationMs = ImMessageService.meter.createHistogram(
    'im_message_db_write_ms',
    {
      description: 'Repository append latency (DB + outbox transaction).',
      unit: 'ms',
    }
  );
  private static readonly persistOutboxWriteDurationMs = ImMessageService.meter.createHistogram(
    'im_message_outbox_write_ms',
    {
      description: 'Outbox write latency marker (currently within repository transaction).',
      unit: 'ms',
    }
  );
  private static readonly persistBatchSizeHistogram = ImMessageService.meter.createHistogram(
    'im_persist_batch_size',
    {
      description: 'Message count of each async persistence batch.',
    }
  );
  private static readonly sequenceSeedDurationMs = ImMessageService.meter.createHistogram(
    'im_sequence_seed_ms',
    {
      description: 'Latency of initial sequence cache seed query.',
      unit: 'ms',
    }
  );

  private readonly logger = new Logger(ImMessageService.name);
  private readonly rateLimitByIdentity = new Map<string, RateLimitWindow>();
  private readonly sequenceByStream = new Map<string, number>();
  private readonly sequenceSeedPromiseByStream = new Map<string, Promise<void>>();
  private readonly cachedResultByStream = new Map<string, Map<string, CachedAppendResult>>();
  private readonly queue: PersistQueueEntry[] = [];
  private readonly streamTouchedAtMs = new Map<string, number>();
  private readonly backpressure = new BackpressureController({
    maxConcurrent: 1000,
    maxQueueSize: ImMessageService.maxPersistQueueLength,
    name: 'im-message-persist',
    rejectThreshold: 45000,
    warnThreshold: ImMessageService.queueWarnThreshold,
  });

  private flushIntervalHandle: NodeJS.Timeout | null = null;
  private flushInProgress = false;
  private lastQueueWarnAtMs = 0;
  private lastStreamCleanupAtMs = 0;
  private isShuttingDown = false;

  constructor(private readonly messageRepository: ImMessageRepository) {}

  onModuleInit(): void {
    this.flushIntervalHandle = setInterval(() => {
      void this.flushQueue();
    }, ImMessageService.persistBatchFlushIntervalMs);

    this.flushIntervalHandle.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;

    if (this.flushIntervalHandle) {
      clearInterval(this.flushIntervalHandle);
      this.flushIntervalHandle = null;
    }

    await this.flushQueue(true);
  }

  async appendMessage(
    context: SocketContext,
    payload: SendMessageDto,
    identity: AuthIdentity
  ): Promise<AppendResult> {
    const sameConversation =
      context.conversationId === payload.conversationId &&
      context.tenantId === identity.tenantId &&
      context.userId === identity.userId;

    if (!sameConversation) {
      throw new WsException('Socket context mismatch for tenant, conversation, or user.');
    }

    const contentBytes = Buffer.byteLength(payload.content, 'utf8');
    if (contentBytes > ImMessageService.maxMessageBytes) {
      throw new WsException(`Message payload exceeds ${ImMessageService.maxMessageBytes} bytes.`);
    }

    this.assertWithinRateLimit(identity);
    const sanitizedContent = this.sanitizeContent(payload.content);
    if (!sanitizedContent) {
      throw new WsException('Message content is empty after sanitization.');
    }

    return ImMessageService.tracer.startActiveSpan('im.appendMessage', async (span) => {
      const startAt = Date.now();
      const streamKey = this.toStreamKey(context.tenantId, context.conversationId);
      const now = Date.now();
      this.streamTouchedAtMs.set(streamKey, now);
      this.cleanupStreamState(now);

      try {
        span.addEvent('message.received', {
          'im.message.receiveAtMs': startAt,
          'im.message.queueSize': this.queue.length,
        });

        const backpressureStatus = this.backpressure.checkCapacity(this.queue.length);
        if (backpressureStatus.shouldReject) {
          throw new WsException(
            `System overloaded (queue at ${backpressureStatus.utilizationPercent.toFixed(1)}% capacity). Please retry later.`
          );
        }

        const cachedResult = this.getCachedAppendResult(streamKey, payload.messageId, now);
        if (cachedResult) {
          ImMessageService.appendDurationMs.record(Date.now() - startAt, {
            duplicate: 'true',
            tenantId: context.tenantId,
          });
          ImMessageService.appendAckDurationMs.record(Date.now() - startAt, {
            duplicate: 'true',
            tenantId: context.tenantId,
          });
          span.addEvent('message.ack.sent', {
            'im.message.duplicate': true,
            'im.message.sendAtMs': Date.now(),
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return cachedResult;
        }

        const sequenceId = await this.reserveSequence(
          streamKey,
          context.tenantId,
          context.conversationId
        );
        const createdAt = new Date().toISOString();
        const pendingMessage: PendingMessage = {
          content: sanitizedContent,
          conversationId: context.conversationId,
          createdAt,
          messageId: payload.messageId,
          messageType: payload.messageType,
          metadata: payload.metadata
            ? {
                fileName: payload.metadata.fileName,
                url: payload.metadata.url,
              }
            : null,
          tenantId: context.tenantId,
          traceId: payload.traceId,
          userId: context.userId,
        };

        const optimisticMessage: StoredMessage = {
          ...pendingMessage,
          messageType: pendingMessage.messageType ?? 'text',
          metadata: pendingMessage.metadata ?? null,
          sequenceId,
        };
        const optimisticResult: AppendResult = {
          duplicate: false,
          message: optimisticMessage,
        };
        this.cacheAppendResult(streamKey, payload.messageId, optimisticResult, false, now);

        if (this.queue.length >= ImMessageService.maxPersistQueueLength) {
          this.warnQueuePressure(this.queue.length);
          const persisted = await this.persistWithRetry({
            enqueuedAtMs: now,
            message: pendingMessage,
            streamKey,
          });
          if (!persisted) {
            throw new WsException('Message persistence is temporarily unavailable.');
          }
        } else {
          this.queue.push({
            enqueuedAtMs: now,
            message: pendingMessage,
            streamKey,
          });

          if (this.queue.length >= ImMessageService.persistBatchSize) {
            void this.flushQueue();
          }
        }

        ImMessageService.appendedCounter.add(1, {
          messageType: optimisticResult.message.messageType,
          tenantId: context.tenantId,
        });

        ImMessageService.appendDurationMs.record(Date.now() - startAt, {
          duplicate: 'false',
          tenantId: context.tenantId,
        });
        ImMessageService.appendAckDurationMs.record(Date.now() - startAt, {
          duplicate: 'false',
          tenantId: context.tenantId,
        });
        span.addEvent('message.ack.sent', {
          'im.message.duplicate': false,
          'im.message.sendAtMs': Date.now(),
          'im.message.queueSize': this.queue.length,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return optimisticResult;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'append failed',
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async flushQueue(forceDrain: boolean = false): Promise<void> {
    if (this.flushInProgress) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    this.flushInProgress = true;
    try {
      let processedBatches = 0;
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, ImMessageService.persistBatchSize);
        if (batch.length === 0) {
          break;
        }

        ImMessageService.persistBatchSizeHistogram.record(batch.length);
        await this.persistBatch(batch);
        processedBatches += 1;

        if (!forceDrain && this.queue.length > ImMessageService.queueWarnThreshold) {
          this.warnQueuePressure(this.queue.length);
        }

        if (!forceDrain && processedBatches >= 5) {
          break;
        }
      }
    } finally {
      this.flushInProgress = false;

      if (!forceDrain && this.queue.length > 0) {
        setImmediate(() => {
          void this.flushQueue();
        });
      }
    }
  }

  private async persistBatch(batch: PersistQueueEntry[]): Promise<void> {
    let index = 0;
    const workerCount = Math.min(ImMessageService.persistConcurrency, batch.length);

    const workers: Promise<void>[] = [];
    for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
      workers.push(
        (async () => {
          while (true) {
            const nextIndex = index;
            index += 1;

            const entry = batch[nextIndex];
            if (!entry) {
              return;
            }

            await this.persistWithRetry(entry);
          }
        })()
      );
    }

    await Promise.all(workers);
  }

  private async persistWithRetry(entry: PersistQueueEntry): Promise<boolean> {
    return ImMessageService.tracer.startActiveSpan('im.persistMessage', async (span) => {
      const queueWaitMs = Math.max(0, Date.now() - entry.enqueuedAtMs);
      ImMessageService.persistQueueWaitDurationMs.record(queueWaitMs, {
        tenantId: entry.message.tenantId,
      });
      span.addEvent('message.db.write.start', {
        'im.message.receiveAtMs': entry.enqueuedAtMs,
        'im.message.dbStartAtMs': Date.now(),
        'im.message.queueWaitMs': queueWaitMs,
      });

      try {
        for (let attempt = 1; attempt <= ImMessageService.persistMaxRetry; attempt += 1) {
          try {
            const dbWriteStartAt = Date.now();
            const persisted = await this.messageRepository.append(entry.message);
            const dbWriteMs = Date.now() - dbWriteStartAt;
            const outboxWriteMs = 0;

            ImMessageService.persistDbWriteDurationMs.record(dbWriteMs, {
              duplicate: String(persisted.duplicate),
              tenantId: entry.message.tenantId,
            });
            ImMessageService.persistOutboxWriteDurationMs.record(outboxWriteMs, {
              tenantId: entry.message.tenantId,
            });

            this.cacheAppendResult(
              entry.streamKey,
              entry.message.messageId,
              persisted,
              true,
              Date.now()
            );
            const currentSequence = this.sequenceByStream.get(entry.streamKey) ?? 0;
            if (persisted.message.sequenceId > currentSequence) {
              this.sequenceByStream.set(entry.streamKey, persisted.message.sequenceId);
            }

            span.addEvent('message.db.write.end', {
              'im.message.dbWriteMs': dbWriteMs,
              'im.message.outboxWriteMs': outboxWriteMs,
            });
            span.addEvent('message.outbox.write.end', {
              'im.message.outboxWriteMs': outboxWriteMs,
              'im.message.outboxWriteMode': 'in_transaction',
            });
            span.setStatus({ code: SpanStatusCode.OK });
            return true;
          } catch (error) {
            if (attempt >= ImMessageService.persistMaxRetry) {
              this.dropFailedCacheEntry(entry.streamKey, entry.message.messageId);
              const reason = error instanceof Error ? error.message : String(error);
              this.logger.error(
                `Failed to persist IM message ${entry.message.messageId} (tenant=${entry.message.tenantId}, conversation=${entry.message.conversationId}) after ${ImMessageService.persistMaxRetry} attempts: ${reason}`
              );
              throw error;
            }

            await this.delay(attempt * ImMessageService.persistRetryDelayMs);
          }
        }

        return false;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'persist failed',
        });
        return false;
      } finally {
        span.end();
      }
    });
  }

  private async reserveSequence(
    streamKey: string,
    tenantId: string,
    conversationId: string
  ): Promise<number> {
    await this.seedSequenceIfNeeded(streamKey, tenantId, conversationId);
    const currentSequence = this.sequenceByStream.get(streamKey) ?? 0;
    const nextSequence = currentSequence + 1;
    this.sequenceByStream.set(streamKey, nextSequence);
    return nextSequence;
  }

  private async seedSequenceIfNeeded(
    streamKey: string,
    tenantId: string,
    conversationId: string
  ): Promise<void> {
    if (this.sequenceByStream.has(streamKey)) {
      return;
    }

    const existingPromise = this.sequenceSeedPromiseByStream.get(streamKey);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    const seedPromise = ImMessageService.tracer.startActiveSpan('im.sequenceSeed', async (span) => {
      const seedStartAt = Date.now();
      try {
        const latestMessage = await this.messageRepository.getLatest(tenantId, conversationId, 1);
        this.sequenceByStream.set(streamKey, latestMessage[0]?.sequenceId ?? 0);
        ImMessageService.sequenceSeedDurationMs.record(Date.now() - seedStartAt, {
          tenantId,
        });
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'seed sequence failed',
        });
        throw error;
      } finally {
        span.end();
      }
    });

    this.sequenceSeedPromiseByStream.set(streamKey, seedPromise);
    try {
      await seedPromise;
    } finally {
      this.sequenceSeedPromiseByStream.delete(streamKey);
    }
  }

  private getCachedAppendResult(
    streamKey: string,
    messageId: string,
    now: number
  ): AppendResult | null {
    const streamCache = this.cachedResultByStream.get(streamKey);
    if (!streamCache) {
      return null;
    }

    const cached = streamCache.get(messageId);
    if (!cached) {
      return null;
    }

    if (now - cached.cachedAtMs > ImMessageService.duplicateCacheTtlMs) {
      streamCache.delete(messageId);
      if (streamCache.size === 0) {
        this.cachedResultByStream.delete(streamKey);
      }
      return null;
    }

    if (!cached.persisted && this.isShuttingDown) {
      return null;
    }

    return cached.result;
  }

  private cacheAppendResult(
    streamKey: string,
    messageId: string,
    result: AppendResult,
    persisted: boolean,
    now: number
  ): void {
    const streamCache =
      this.cachedResultByStream.get(streamKey) ?? new Map<string, CachedAppendResult>();
    streamCache.set(messageId, {
      cachedAtMs: now,
      persisted,
      result,
    });

    while (streamCache.size > ImMessageService.duplicateCacheMaxPerStream) {
      const oldestMessageId = streamCache.keys().next().value as string | undefined;
      if (!oldestMessageId) {
        break;
      }
      streamCache.delete(oldestMessageId);
    }

    this.cachedResultByStream.set(streamKey, streamCache);
  }

  private cleanupStreamState(now: number): void {
    if (now - this.lastStreamCleanupAtMs < ImMessageService.streamStateCleanupIntervalMs) {
      return;
    }

    this.lastStreamCleanupAtMs = now;
    for (const [streamKey, touchedAtMs] of this.streamTouchedAtMs.entries()) {
      if (now - touchedAtMs <= ImMessageService.streamStateTtlMs) {
        continue;
      }

      this.sequenceByStream.delete(streamKey);
      this.sequenceSeedPromiseByStream.delete(streamKey);
      this.cachedResultByStream.delete(streamKey);
      this.streamTouchedAtMs.delete(streamKey);
    }
  }

  private dropFailedCacheEntry(streamKey: string, messageId: string): void {
    const streamCache = this.cachedResultByStream.get(streamKey);
    if (!streamCache) {
      return;
    }

    streamCache.delete(messageId);
    if (streamCache.size === 0) {
      this.cachedResultByStream.delete(streamKey);
    }
  }

  private warnQueuePressure(queueLength: number): void {
    const now = Date.now();
    if (now - this.lastQueueWarnAtMs < ImMessageService.queueWarnIntervalMs) {
      return;
    }

    this.lastQueueWarnAtMs = now;
    this.logger.warn(
      `IM persist queue pressure detected: queueLength=${queueLength}, batchSize=${ImMessageService.persistBatchSize}, concurrency=${ImMessageService.persistConcurrency}.`
    );
  }

  private toStreamKey(tenantId: string, conversationId: string): string {
    return `${tenantId}::${conversationId}`;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), ms);
    });
  }

  private assertWithinRateLimit(identity: AuthIdentity): void {
    const windowMs = 1000;
    const limit = runtimeConfig.rateLimit.wsMessagesPerSecond;
    const now = Date.now();
    const key = `${identity.tenantId}::${identity.userId}`;
    const existingWindow = this.rateLimitByIdentity.get(key);

    if (!existingWindow || now - existingWindow.windowStartedAt >= windowMs) {
      this.rateLimitByIdentity.set(key, {
        count: 1,
        windowStartedAt: now,
      });
      return;
    }

    existingWindow.count += 1;
    if (existingWindow.count > limit) {
      throw new WsException(`Rate limit exceeded: max ${limit} messages per second.`);
    }
  }

  private sanitizeContent(rawContent: string): string {
    return rawContent
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<\/?[^>]+(>|$)/g, '')
      .trim();
  }
}
