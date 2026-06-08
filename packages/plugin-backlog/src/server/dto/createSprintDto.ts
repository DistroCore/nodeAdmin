import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSprintDto {
  @ApiProperty({ description: 'Sprint name', example: 'Sprint 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Sprint goal' })
  @IsString()
  @IsOptional()
  goal?: string;

  @ApiPropertyOptional({
    description: 'Status',
    enum: ['planning', 'active', 'completed'],
    default: 'planning',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}
