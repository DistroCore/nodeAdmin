import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './rolesService';
import { CreateRoleDto } from './dto/createRoleDto';
import { UpdateRoleDto } from './dto/updateRoleDto';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'List roles for a tenant' })
  async list(@Query('tenantId') tenantId?: string) {
    return this.rolesService.list(tenantId ?? 'default');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID' })
  async findOne(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.rolesService.findById(tenantId ?? 'default', id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new role' })
  async create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto.tenantId, dto.name, dto.description, dto.permissionIds);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a role' })
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @Query('tenantId') tenantId?: string) {
    return this.rolesService.update(tenantId ?? 'default', id, {
      name: dto.name,
      description: dto.description,
      permissionIds: dto.permissionIds,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a role' })
  async remove(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.rolesService.remove(tenantId ?? 'default', id);
    return { success: true };
  }
}
