import { Injectable } from '@nestjs/common';
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import { WsException } from '@nestjs/websockets';
import { runtimeConfig } from '../../../App/runtimeConfig';
import { SocketContext } from '../../../Infrastructure/connectionRegistry';
import { AppendResult } from '../../../Infrastructure/inMemoryMessageStore';
import { ImMessageRepository } from '../../../Infrastructure/Database/imMessageRepository';
import { AuthIdentity } from '../../Auth/authIdentity';
import { SendMessageDto } from '../dto/sendMessageDto';

interface RateLimitWindow {
  count: number;
  windowStartedAt: number;
}

@Injectable()
export class ImMessageService {
  static readonly maxMessageBytes = 1024 * 1024;
  private static readonly meter = metrics.getMeter('core-api-im');
  private static readonly tracer = trace.getTracer('core-api-im');
  private static readonly appendedCounter = ImMessageService.meter.createCounter('im_messages_appended_total', {
    description: 'Total IM messages accepted by the server.',
  });
  private static readonly appendDurationMs = ImMessageService.meter.createHistogram('im_message_append_ms', {
    description: 'Latency of append pipeline for IM messages.',
    unit: 'ms',
  });

  private readonly rateLimitByIdentity = new Map<string, RateLimitWindow>();

  constructor(private readonly messageRepository: ImMessageRepository) {}

  async appendMessage(context: SocketContext, payload: SendMessageDto, identity: AuthIdentity): Promise<AppendResult> {
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

      try {
        const result = await this.messageRepository.append({
          content: sanitizedContent,
          conversationId: context.conversationId,
          createdAt: new Date().toISOString(),
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
        });

        if (!result.duplicate) {
          ImMessageService.appendedCounter.add(1, {
            messageType: result.message.messageType,
            tenantId: context.tenantId,
          });
        }

        ImMessageService.appendDurationMs.record(Date.now() - startAt, {
          duplicate: String(result.duplicate),
          tenantId: context.tenantId,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
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
