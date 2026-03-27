import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { FastifyReply } from 'fastify';
import { Socket } from 'socket.io';

interface ErrorPayload {
  code: string;
  message: string;
  traceId: string;
}

@Catch()
export class UnifiedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnifiedExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const traceId = this.createTraceId();
    const payload = this.toErrorPayload(exception, traceId);

    this.logger.error(
      JSON.stringify({
        ...payload,
        hostType: host.getType(),
      })
    );

    if (host.getType() === 'http') {
      const response = host.switchToHttp().getResponse<FastifyReply>();
      const statusCode =
        exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;

      response.status(statusCode).send(payload);
      return;
    }

    if (host.getType() === 'ws') {
      const client = host.switchToWs().getClient<Socket>();
      client.emit('wsError', payload);
      return;
    }
  }

  private toErrorPayload(exception: unknown, traceId: string): ErrorPayload {
    if (exception instanceof WsException) {
      const error = exception.getError();

      if (typeof error === 'string') {
        return {
          code: 'IM_001',
          message: error,
          traceId,
        };
      }

      if (typeof error === 'object' && error) {
        const code = this.toSafeString((error as Partial<{ code: string }>).code) ?? 'IM_001';
        const message =
          this.toSafeString((error as Partial<{ message: string }>).message) ??
          'WebSocket request failed.';

        return {
          code,
          message,
          traceId,
        };
      }
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const code = statusCode >= 500 ? 'API_500' : `API_${statusCode}`;
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return {
          code,
          message: response,
          traceId,
        };
      }

      if (typeof response === 'object' && response) {
        const message =
          this.toSafeString((response as Partial<{ message: string }>).message) ??
          exception.message;

        return {
          code,
          message,
          traceId,
        };
      }

      return {
        code,
        message: exception.message,
        traceId,
      };
    }

    if (exception instanceof Error) {
      return {
        code: 'API_500',
        message: exception.message,
        traceId,
      };
    }

    return {
      code: 'API_500',
      message: 'Unexpected server error.',
      traceId,
    };
  }

  private toSafeString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private createTraceId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}
