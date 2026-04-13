import { IsNotEmpty, IsString, Matches } from 'class-validator';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

export class UpdatePluginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(SEMVER_PATTERN)
  version!: string;
}
