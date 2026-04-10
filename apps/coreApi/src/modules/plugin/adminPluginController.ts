import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PluginManifest } from '@nodeadmin/shared-types';
import { CurrentUser } from '../auth/currentUser.decorator';
import type { AuthIdentity } from '../auth/authIdentity';
import { PluginMarketService } from './pluginMarketService';

interface InstallPluginDto {
  pluginId: string;
  version: string;
}

interface UpdatePluginDto {
  version: string;
}

interface PublishPluginDto {
  bundleUrl: string;
  changelog?: string;
  manifest: PluginManifest;
  serverPackage: string;
}

@ApiTags('admin-plugins')
@ApiBearerAuth()
@Controller('admin/plugins')
export class AdminPluginController {
  constructor(private readonly pluginMarketService: PluginMarketService) {}

  @Get()
  @ApiOperation({ summary: 'List marketplace plugins for administrators' })
  async list(
    @CurrentUser() user: AuthIdentity,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('search') search?: string,
  ) {
    this.assertAdmin(user);
    return this.pluginMarketService.listMarketplacePlugins(page, pageSize, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plugin marketplace details' })
  async getDetails(@CurrentUser() user: AuthIdentity, @Param('id') pluginId: string) {
    this.assertAdmin(user);
    return this.pluginMarketService.getPluginDetails(pluginId);
  }

  @Post('install')
  @ApiOperation({ summary: 'Install a marketplace plugin for the current tenant' })
  async install(@CurrentUser() user: AuthIdentity, @Body() dto: InstallPluginDto) {
    this.assertAdmin(user);
    return this.pluginMarketService.installPlugin(user.tenantId, dto.pluginId, dto.version);
  }

  @Post(':id/update')
  @ApiOperation({ summary: 'Update an installed marketplace plugin' })
  async update(@CurrentUser() user: AuthIdentity, @Param('id') pluginId: string, @Body() dto: UpdatePluginDto) {
    this.assertAdmin(user);
    return this.pluginMarketService.updatePlugin(user.tenantId, pluginId, dto.version);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Uninstall a marketplace plugin for the current tenant' })
  async remove(@CurrentUser() user: AuthIdentity, @Param('id') pluginId: string) {
    this.assertAdmin(user);
    return this.pluginMarketService.uninstallPlugin(user.tenantId, pluginId);
  }

  @Post('publish')
  @ApiOperation({ summary: 'Publish a marketplace plugin version' })
  async publish(@CurrentUser() user: AuthIdentity, @Body() dto: PublishPluginDto) {
    this.assertAdmin(user);
    return this.pluginMarketService.publishPlugin(dto);
  }

  private assertAdmin(user: AuthIdentity): void {
    const isAdmin = user.roles.includes('admin') || user.roles.includes('super-admin');
    if (!isAdmin) {
      throw new ForbiddenException('Administrator role required.');
    }
  }
}
