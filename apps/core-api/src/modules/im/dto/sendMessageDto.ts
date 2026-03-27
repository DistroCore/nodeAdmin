import { Type } from 'class-transformer';
import type { ImMessageType } from '@nodeadmin/shared-types';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const imMessageTypes: ImMessageType[] = ['text', 'image', 'file', 'system'];

export class SendMessageMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  fileName?: string;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  messageId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  traceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsIn(imMessageTypes)
  messageType?: ImMessageType;

  @IsOptional()
  @ValidateNested()
  @Type(() => SendMessageMetadataDto)
  metadata?: SendMessageMetadataDto;
}
