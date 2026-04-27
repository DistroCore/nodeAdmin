import { IsDefined, IsObject } from 'class-validator';

export class UpdatePluginConfigDto {
  @IsDefined()
  @IsObject()
  config!: Record<string, unknown>;
}
