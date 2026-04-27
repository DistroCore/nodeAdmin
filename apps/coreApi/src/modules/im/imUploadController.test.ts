import { BadRequestException, PayloadTooLargeException, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestEnv } from '../../__tests__/helpers';
import type { AuthIdentity } from '../auth/authIdentity';

setupTestEnv();

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'upload-uuid'),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

import { mkdir, writeFile } from 'node:fs/promises';
import { ImUploadController } from './imUploadController';

interface MockMultipartFile {
  filename: string;
  mimetype: string;
  toBuffer: ReturnType<typeof vi.fn>;
}

interface MockUploadRequest {
  file: (options?: unknown) => Promise<MockMultipartFile | null>;
  lastOptions?: unknown;
}

const mockUser: AuthIdentity = {
  jti: 'jti-1',
  principalType: 'user',
  roles: ['user'],
  tenantId: 'tenant-1',
  userId: 'user-1',
};

function createRequest(fileResult: MockMultipartFile | null | Error): MockUploadRequest {
  const request: MockUploadRequest = {
    file: vi.fn(async (options?: unknown) => {
      request.lastOptions = options;

      if (fileResult instanceof Error) {
        throw fileResult;
      }

      return fileResult;
    }),
  };

  return request;
}

describe('ImUploadController', () => {
  let controller: ImUploadController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ImUploadController();
  });

  it('AC1 should upload image file successfully', async () => {
    const buffer = Buffer.from('image-bytes');
    const request = createRequest({
      filename: 'photo.png',
      mimetype: 'image/png',
      toBuffer: vi.fn().mockResolvedValue(buffer),
    });

    const result = await controller.upload(request as unknown as FastifyRequest, mockUser);

    expect(request.file).toHaveBeenCalledWith({
      limits: { fileSize: expect.any(Number) },
    });
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('tenant-1'), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('upload-uuid.png'), buffer);
    expect(result).toEqual({
      fileName: 'photo.png',
      fileSizeBytes: buffer.length,
      url: expect.stringContaining('/tenant-1/upload-uuid.png'),
    });
  });

  it('AC2 should reject non-image file uploads', async () => {
    const request = createRequest({
      filename: 'document.pdf',
      mimetype: 'application/pdf',
      toBuffer: vi.fn(),
    });

    await expect(controller.upload(request as unknown as FastifyRequest, mockUser)).rejects.toThrow(
      BadRequestException,
    );

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('AC3 should reject files that exceed the size limit', async () => {
    const error = Object.assign(new Error('File too large'), { code: 'FST_REQ_FILE_TOO_LARGE' });
    const request = createRequest(error);

    await expect(controller.upload(request as unknown as FastifyRequest, mockUser)).rejects.toThrow(
      PayloadTooLargeException,
    );

    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('AC4 should reject missing auth before reading the upload stream', async () => {
    const request = createRequest({
      filename: 'photo.png',
      mimetype: 'image/png',
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('image-bytes')),
    });

    await expect(
      controller.upload(request as unknown as FastifyRequest, undefined as unknown as AuthIdentity),
    ).rejects.toThrow(UnauthorizedException);

    expect(request.file).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
