import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'Email address for the new user', example: 'jane@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ description: 'Initial password (minimum 8 characters)', example: 'S3cureP@ss!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ description: 'Display name of the user', example: 'Jane Smith' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    description: 'Tenant identifier to create the user in',
    example: 'tenant-abc-123',
  })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiPropertyOptional({
    description: 'IDs of roles to assign to the user',
    example: ['role-admin-001', 'role-editor-002'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  roleIds?: string[];
}
