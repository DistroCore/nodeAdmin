import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class IssueDevTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  userId!: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  roles?: string[];
}
