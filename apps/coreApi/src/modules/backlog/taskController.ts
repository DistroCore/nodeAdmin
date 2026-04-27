import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DEFAULT_TENANT_ID } from '../../app/constants';
import { BacklogService } from './backlogService';
import { CreateTaskDto } from './dto/createTaskDto';
import { UpdateTaskDto } from './dto/updateTaskDto';
import { ListBacklogQueryDto } from './dto/listBacklogQueryDto';

@ApiTags('backlog')
@ApiBearerAuth()
@Controller('backlog/tasks')
export class TaskController {
  constructor(private readonly backlogService: BacklogService) {}

  @Get()
  @ApiOperation({ summary: 'List tasks with pagination and filters' })
  async list(@Query() query: ListBacklogQueryDto) {
    const tenantId = query.tenantId ?? DEFAULT_TENANT_ID;
    return this.backlogService.listTasks(tenantId, query.page, query.pageSize, {
      status: query.status,
      sprintId: query.sprintId,
      search: query.search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID' })
  async findOne(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.backlogService.findTaskById(tenantId ?? DEFAULT_TENANT_ID, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() dto: CreateTaskDto) {
    return this.backlogService.createTask(dto.tenantId, {
      title: dto.title,
      description: dto.description,
      status: dto.status,
      priority: dto.priority,
      assigneeId: dto.assigneeId,
      sprintId: dto.sprintId,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @Query('tenantId') tenantId?: string) {
    return this.backlogService.updateTask(tenantId ?? DEFAULT_TENANT_ID, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  async remove(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.backlogService.removeTask(tenantId ?? DEFAULT_TENANT_ID, id);
    return { success: true };
  }
}
