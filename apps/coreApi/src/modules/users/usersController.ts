import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './usersService';
import { CreateUserDto } from './dto/createUserDto';
import { UpdateUserDto } from './dto/updateUserDto';
import { ListUsersQueryDto } from './dto/listUsersQueryDto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with pagination and search' })
  async list(@Query() query: ListUsersQueryDto) {
    const tenantId = query.tenantId ?? 'default';
    return this.usersService.list(tenantId, query.page, query.pageSize, query.search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.usersService.findById(tenantId ?? 'default', id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto.tenantId, dto.email, dto.password, dto.name, dto.roleIds);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Query('tenantId') tenantId?: string) {
    return this.usersService.update(tenantId ?? 'default', id, {
      name: dto.name,
      avatar: dto.avatar,
      isActive: dto.isActive,
      roleIds: dto.roleIds,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  async remove(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.usersService.remove(tenantId ?? 'default', id);
    return { success: true };
  }
}
