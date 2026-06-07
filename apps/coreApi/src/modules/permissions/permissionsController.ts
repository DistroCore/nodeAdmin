import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DEFAULT_TENANT_ID } from '../../app/constants';
import { CurrentUser } from '../auth/currentUser.decorator';
import type { AuthIdentity } from '../auth/authIdentity';
import { collectPluginPermissionCodes } from '../plugin/pluginPermissionCodes';
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

  // Declared before the `:module` param route so the two-segment path isn't shadowed.
  @Get('me/plugins')
  @ApiOperation({ summary: "List the current user's granted plugin permission codes" })
  async getMyPluginPermissions(@CurrentUser() identity: AuthIdentity) {
    const pluginCodes = collectPluginPermissionCodes();
    const permissions = await this.permissionsService.getGrantedCodesForUser(
      identity.tenantId,
      identity.userId,
      pluginCodes,
    );
    return { permissions };
  }

  @Get(':module')
  @ApiOperation({ summary: 'List permissions by module' })
  async findByModule(@Param('module') module: string, @Query('tenantId') tenantId?: string) {
    return this.permissionsService.findByModule(tenantId ?? DEFAULT_TENANT_ID, module);
  }
}
