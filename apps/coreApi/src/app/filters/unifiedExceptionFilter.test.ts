import { ArgumentsHost, HttpException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UnifiedExceptionFilter } from './unifiedExceptionFilter';

interface ErrorPayload {
  code: string;
  message: string;
  traceId: string;
}

interface ReplyStub {
  send: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
}

function createHttpHost(reply: ReplyStub): ArgumentsHost {
  return {
    getArgByIndex: vi.fn(),
    getArgs: vi.fn(),
    getType: () => 'http',
    switchToHttp: () => ({
      getNext: vi.fn(),
      getRequest: vi.fn(),
      getResponse: () => reply,
    }),
    switchToRpc: vi.fn(),
    switchToWs: vi.fn(),
  } as unknown as ArgumentsHost;
}

function createWsHost(emit: ReturnType<typeof vi.fn>): ArgumentsHost {
  return {
    getArgByIndex: vi.fn(),
    getArgs: vi.fn(),
    getType: () => 'ws',
    switchToHttp: vi.fn(),
    switchToRpc: vi.fn(),
    switchToWs: () => ({
      getClient: () => ({ emit }),
      getData: vi.fn(),
      getPattern: vi.fn(),
    }),
  } as unknown as ArgumentsHost;
}

describe('UnifiedExceptionFilter', () => {
  let filter: UnifiedExceptionFilter;
  let logError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    filter = new UnifiedExceptionFilter();
    logError = vi.fn();
    const logger = (filter as unknown as { logger: { error: ReturnType<typeof vi.fn> } }).logger;
    logger.error = logError;
  });

  it('returns a client-safe 500 payload without exposing an internal Error message', () => {
    const reply: ReplyStub = { send: vi.fn(), status: vi.fn() };
    reply.status.mockReturnValue(reply);

    filter.catch(new Error('relation users_internal does not exist'), createHttpHost(reply));

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      code: 'API_500',
      message: 'Internal server error.',
      traceId: expect.any(String),
    });
    expect(JSON.stringify(reply.send.mock.calls)).not.toContain('users_internal');
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('relation users_internal does not exist'),
      expect.stringContaining('relation users_internal does not exist'),
    );
  });

  it('also sanitizes messages carried by 5xx HttpException responses', () => {
    const reply: ReplyStub = { send: vi.fn(), status: vi.fn() };
    reply.status.mockReturnValue(reply);

    filter.catch(new HttpException({ message: 'SELECT failed with credential secret' }, 503), createHttpHost(reply));

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'API_500', message: 'Internal server error.' }),
    );
  });

  it.each([
    [new HttpException('Validation failed.', 400), 'Validation failed.'],
    [new HttpException({ message: 'Tenant is required.' }, 422), 'Tenant is required.'],
    [new HttpException({}, 403), 'Http Exception'],
  ])('preserves a safe client-error response', (exception, expectedMessage) => {
    const reply: ReplyStub = { send: vi.fn(), status: vi.fn() };
    reply.status.mockReturnValue(reply);

    filter.catch(exception, createHttpHost(reply));

    expect(reply.status).toHaveBeenCalledWith(exception.getStatus());
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: `API_${exception.getStatus()}`, message: expectedMessage }),
    );
  });

  it.each([
    [new WsException('Socket request rejected.'), { code: 'IM_001', message: 'Socket request rejected.' }],
    [new WsException({ code: 'IM_403', message: 'Not a member.' }), { code: 'IM_403', message: 'Not a member.' }],
    [new WsException({ code: '  ', message: null }), { code: 'IM_001', message: 'WebSocket request failed.' }],
  ])('emits normalized WebSocket errors', (exception, expectedPayload) => {
    const emit = vi.fn();

    filter.catch(exception, createWsHost(emit));

    expect(emit).toHaveBeenCalledWith('wsError', {
      ...expectedPayload,
      traceId: expect.any(String),
    });
  });

  it('logs but does not try to reply for an unknown host type', () => {
    const host = {
      getType: () => 'rpc',
      switchToHttp: vi.fn(),
      switchToWs: vi.fn(),
    } as unknown as ArgumentsHost;

    expect(() => filter.catch('unknown failure', host)).not.toThrow();
    expect(host.switchToHttp).not.toHaveBeenCalled();
    expect(host.switchToWs).not.toHaveBeenCalled();
  });

  it('returns the generic payload for non-Error HTTP failures', () => {
    const reply: ReplyStub = { send: vi.fn(), status: vi.fn() };
    reply.status.mockReturnValue(reply);

    filter.catch({ unexpected: true }, createHttpHost(reply));

    const payload = reply.send.mock.calls[0][0] as ErrorPayload;
    expect(payload).toMatchObject({ code: 'API_500', message: 'Unexpected server error.' });
  });
});
