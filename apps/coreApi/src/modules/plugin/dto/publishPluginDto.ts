import type { PluginManifest } from '@nodeadmin/shared-types';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class PublishPluginDto {
  @IsString()
  @IsNotEmpty()
  bundleUrl!: string;

  @IsOptional()
  @IsString()
  changelog?: string;

  @IsObject()
  manifest!: PluginManifest;

  @IsString()
  @IsNotEmpty()
  serverPackage!: string;
}
