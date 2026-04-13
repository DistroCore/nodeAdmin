import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/currentUser.decorator';
import type { AuthIdentity } from '../auth/authIdentity';
import { InstallPluginDto } from './dto/installPluginDto';
import { ListPluginsQueryDto } from './dto/listPluginsQueryDto';
import { PublishPluginDto } from './dto/publishPluginDto';
import { UpdatePluginConfigDto } from './dto/updatePluginConfigDto';
import { UpdatePluginDto } from './dto/updatePluginDto';
import { PluginMarketService } from './pluginMarketService';
import { PluginService } from './pluginService';

@ApiTags('admin-plugins')
@ApiBearerAuth()
@Controller('admin/plugins')
export class AdminPluginController {
  constructor(
    private readonly pluginMarketService: PluginMarketService,
    private readonly pluginService: PluginService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List marketplace plugins for administrators' })
  async list(
    @CurrentUser() user: AuthIdentity,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query() query: ListPluginsQueryDto,
  ) {
    this.assertAdmin(user);
    return this.pluginMarketService.listMarketplacePlugins(page, pageSize, query.search);
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

  @Patch(':id/config')
  @ApiOperation({ summary: 'Update tenant plugin configuration' })
  async updateConfig(
    @CurrentUser() user: AuthIdentity,
    @Param('id') pluginId: string,
    @Body() dto: UpdatePluginConfigDto,
  ) {
    this.assertAdmin(user);
    return this.pluginService.updatePluginConfig(user.tenantId, pluginId, dto.config);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Toggle tenant plugin enabled state' })
  async toggle(@CurrentUser() user: AuthIdentity, @Param('id') pluginId: string) {
    this.assertAdmin(user);
    return this.pluginService.togglePluginEnabled(user.tenantId, pluginId);
  }

  @Post('publish')
  @ApiOperation({ summary: 'Publish a marketplace plugin version' })
  async publish(@CurrentUser() user: AuthIdentity, @Body() dto: PublishPluginDto) {
    this.assertSuperAdmin(user);
    return this.pluginMarketService.publishPlugin(dto);
  }

  private assertAdmin(user: AuthIdentity): void {
    const isAdmin = user.roles.includes('admin') || user.roles.includes('super-admin');
    if (!isAdmin) {
      throw new ForbiddenException('Administrator role required.');
    }
  }

  private assertSuperAdmin(user: AuthIdentity): void {
    if (!user.roles.includes('super-admin')) {
      throw new ForbiddenException('Super-administrator role required for marketplace publishing.');
    }
  }
}
