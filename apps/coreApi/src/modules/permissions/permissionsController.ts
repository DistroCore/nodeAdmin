import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DEFAULT_TENANT_ID } from '../../app/constants';
import { PermissionsService } from './permissionsService';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all permissions' })
  async findAll(@Query('tenantId') tenantId?: string) {
    return this.permissionsService.findAll(tenantId ?? DEFAULT_TENANT_ID);
  }

  @Get(':module')
  @ApiOperation({ summary: 'List permissions by module' })
  async findByModule(@Param('module') module: string, @Query('tenantId') tenantId?: string) {
    return this.permissionsService.findByModule(tenantId ?? DEFAULT_TENANT_ID, module);
  }
}
