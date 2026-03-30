import { BadRequestException, Controller, Logger, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runtimeConfig } from '../../app/runtimeConfig';
import { CurrentUser } from '../auth/currentUser.decorator';
import { AuthIdentity } from '../auth/authIdentity';

interface UploadResult {
  fileName: string;
  fileSizeBytes: number;
  url: string;
}

@ApiTags('im')
@Controller('im')
export class ImUploadController {
  private readonly logger = new Logger(ImUploadController.name);

  @Post('upload')
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'Upload an image file for IM messages' })
  async upload(
    @Req() request: FastifyRequest,
    @CurrentUser() user: AuthIdentity
  ): Promise<UploadResult> {
    const data = await request.file({
      limits: { fileSize: runtimeConfig.upload.maxFileSize },
    });

    if (!data) {
      throw new BadRequestException('No file uploaded.');
    }

    if (!runtimeConfig.upload.allowedMimeTypes.includes(data.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${data.mimetype}. Allowed: ${runtimeConfig.upload.allowedMimeTypes.join(', ')}`
      );
    }

    const ext = this.mimeToExt(data.mimetype);
    const storedFileName = `${randomUUID()}${ext}`;
    const tenantDir = join(runtimeConfig.upload.storagePath, user.tenantId);

    await mkdir(tenantDir, { recursive: true });

    const filePath = join(tenantDir, storedFileName);
    const buffer = await data.toBuffer();
    await writeFile(filePath, buffer);

    const url = `/${runtimeConfig.upload.storagePath}/${user.tenantId}/${storedFileName}`;

    this.logger.log(
      `File uploaded: tenant=${user.tenantId} file=${storedFileName} size=${buffer.length} mime=${data.mimetype}`
    );

    return {
      fileName: data.filename || storedFileName,
      fileSizeBytes: buffer.length,
      url,
    };
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    return map[mime] || '.bin';
  }
}
