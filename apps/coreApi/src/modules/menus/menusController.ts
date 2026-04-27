import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DEFAULT_TENANT_ID } from '../../app/constants';
import { MenusService } from './menusService';
import { CreateMenuDto } from './dto/createMenuDto';
import { UpdateMenuDto } from './dto/updateMenuDto';
import { SetRoleMenusDto } from './dto/setRoleMenusDto';

@ApiTags('menus')
@ApiBearerAuth()
@Controller('menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  @ApiOperation({ summary: 'List all menus' })
  async findAll(@Query('tenantId') tenantId?: string) {
    return this.menusService.findAll(tenantId ?? DEFAULT_TENANT_ID);
  }

  @Get('role/:roleId')
  @ApiOperation({ summary: 'Get menus assigned to a role' })
  async getRoleMenus(@Param('roleId') roleId: string, @Query('tenantId') tenantId?: string) {
    return this.menusService.getRoleMenus(tenantId ?? DEFAULT_TENANT_ID, roleId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get menus visible to a user' })
  async getUserMenus(@Param('userId') userId: string, @Query('tenantId') tenantId?: string) {
    return this.menusService.getUserMenus(tenantId ?? DEFAULT_TENANT_ID, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get menu by ID' })
  async findOne(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.menusService.findById(tenantId ?? DEFAULT_TENANT_ID, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new menu item' })
  async create(@Body() dto: CreateMenuDto, @Query('tenantId') tenantId?: string) {
    return this.menusService.create(tenantId ?? DEFAULT_TENANT_ID, {
      parentId: dto.parentId,
      name: dto.name,
      path: dto.path,
      icon: dto.icon,
      sortOrder: dto.sortOrder,
      permissionCode: dto.permissionCode,
      isVisible: dto.isVisible,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a menu item' })
  async update(@Param('id') id: string, @Body() dto: UpdateMenuDto, @Query('tenantId') tenantId?: string) {
    return this.menusService.update(tenantId ?? DEFAULT_TENANT_ID, id, {
      parentId: dto.parentId,
      name: dto.name,
      path: dto.path,
      icon: dto.icon,
      sortOrder: dto.sortOrder,
      permissionCode: dto.permissionCode,
      isVisible: dto.isVisible,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a menu item' })
  async remove(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.menusService.remove(tenantId ?? DEFAULT_TENANT_ID, id);
    return { success: true };
  }

  @Put('role/:roleId')
  @ApiOperation({ summary: 'Set menus for a role' })
  async setRoleMenus(@Param('roleId') roleId: string, @Body() dto: SetRoleMenusDto, @Query('tenantId') tenantId?: string) {
    return this.menusService.setRoleMenus(tenantId ?? DEFAULT_TENANT_ID, roleId, dto.menuIds);
  }
}
