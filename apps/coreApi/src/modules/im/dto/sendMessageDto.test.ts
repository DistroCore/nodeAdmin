import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { SendMessageDto } from './sendMessageDto';

describe('SendMessageDto', () => {
  it('accepts a valid payload with nested metadata', () => {
    const dto = plainToInstance(SendMessageDto, {
      content: 'hello world',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      messageType: 'file',
      metadata: {
        fileName: 'notes.pdf',
        url: 'https://example.com/notes.pdf',
      },
      traceId: 'trace-1',
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects invalid messageType and nested metadata length violations', () => {
    const dto = plainToInstance(SendMessageDto, {
      content: 'hello world',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      messageType: 'video',
      metadata: {
        fileName: 'x'.repeat(257),
      },
      traceId: 'trace-1',
    });

    const errors = validateSync(dto);

    expect(findPropertyError(errors, 'messageType')).toBeTruthy();
    const metadataError = findPropertyError(errors, 'metadata');

    expect(metadataError?.children?.[0]?.property).toBe('fileName');
  });

  it('rejects missing required top-level fields', () => {
    const dto = plainToInstance(SendMessageDto, {});
    const errors = validateSync(dto);

    expect(findPropertyError(errors, 'content')).toBeTruthy();
    expect(findPropertyError(errors, 'conversationId')).toBeTruthy();
    expect(findPropertyError(errors, 'messageId')).toBeTruthy();
    expect(findPropertyError(errors, 'traceId')).toBeTruthy();
  });

  it('rejects overlong content and metadata URL values', () => {
    const dto = plainToInstance(SendMessageDto, {
      content: 'x'.repeat(2001),
      conversationId: 'conversation-1',
      messageId: 'message-1',
      metadata: {
        url: 'https://example.com/' + 'x'.repeat(1100),
      },
      traceId: 'trace-1',
    });

    const errors = validateSync(dto);

    expect(findPropertyError(errors, 'content')).toBeTruthy();
    const metadataError = findPropertyError(errors, 'metadata');
    expect(metadataError?.children?.[0]?.property).toBe('url');
  });

  it('accepts message payloads without optional metadata or messageType', () => {
    const dto = plainToInstance(SendMessageDto, {
      content: 'plain text',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      traceId: 'trace-1',
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('accepts blank nested metadata strings because only length is constrained', () => {
    const dto = plainToInstance(SendMessageDto, {
      content: 'file message',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      metadata: {
        fileName: '',
        url: '',
      },
      traceId: 'trace-1',
    });

    expect(validateSync(dto)).toEqual([]);
  });
});

function findPropertyError(errors: ValidationError[], property: string): ValidationError | undefined {
  return errors.find((error) => error.property === property);
}
