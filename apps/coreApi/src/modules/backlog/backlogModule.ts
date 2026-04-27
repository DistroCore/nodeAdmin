import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { TaskController } from './taskController';
import { SprintController } from './sprintController';
import { BacklogService } from './backlogService';

@Module({
  imports: [InfrastructureModule],
  controllers: [TaskController, SprintController],
  providers: [BacklogService],
  exports: [BacklogService],
})
export class BacklogModule {}
