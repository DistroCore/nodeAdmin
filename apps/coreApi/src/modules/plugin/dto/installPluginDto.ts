import { IsNotEmpty, IsString, Matches } from 'class-validator';

const PLUGIN_ID_PATTERN = /^@nodeadmin\/plugin-[a-z0-9-]+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

export class InstallPluginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(PLUGIN_ID_PATTERN)
  pluginId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(SEMVER_PATTERN)
  version!: string;
}
