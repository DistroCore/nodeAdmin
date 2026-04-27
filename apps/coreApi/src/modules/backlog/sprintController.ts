import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DEFAULT_TENANT_ID } from '../../app/constants';
import { BacklogService } from './backlogService';
import { CreateSprintDto } from './dto/createSprintDto';
import { UpdateSprintDto } from './dto/updateSprintDto';
import { ListBacklogQueryDto } from './dto/listBacklogQueryDto';

@ApiTags('backlog')
@ApiBearerAuth()
@Controller('backlog/sprints')
export class SprintController {
  constructor(private readonly backlogService: BacklogService) {}

  @Get()
  @ApiOperation({ summary: 'List sprints with pagination and filters' })
  async list(@Query() query: ListBacklogQueryDto) {
    const tenantId = query.tenantId ?? DEFAULT_TENANT_ID;
    return this.backlogService.listSprints(tenantId, query.page, query.pageSize, {
      status: query.status,
      search: query.search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sprint by ID' })
  async findOne(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.backlogService.findSprintById(tenantId ?? DEFAULT_TENANT_ID, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new sprint' })
  async create(@Body() dto: CreateSprintDto) {
    return this.backlogService.createSprint(dto.tenantId, {
      name: dto.name,
      goal: dto.goal,
      status: dto.status,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a sprint' })
  async update(@Param('id') id: string, @Body() dto: UpdateSprintDto, @Query('tenantId') tenantId?: string) {
    return this.backlogService.updateSprint(tenantId ?? DEFAULT_TENANT_ID, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a sprint' })
  async remove(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.backlogService.removeSprint(tenantId ?? DEFAULT_TENANT_ID, id);
    return { success: true };
  }

  @Post(':id/tasks')
  @ApiOperation({ summary: 'Assign tasks to a sprint' })
  async assignTasks(
    @Param('id') id: string,
    @Body() body: { taskIds: string[] },
    @Query('tenantId') tenantId?: string,
  ) {
    return this.backlogService.assignTasksToSprint(tenantId ?? DEFAULT_TENANT_ID, id, body.taskIds);
  }
}
