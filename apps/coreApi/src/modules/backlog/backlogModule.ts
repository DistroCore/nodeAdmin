import { Module } from '@nestjs/common';
import { TaskController } from './taskController';
import { SprintController } from './sprintController';
import { BacklogService } from './backlogService';

@Module({
  controllers: [TaskController, SprintController],
  providers: [BacklogService],
  exports: [BacklogService],
})
export class BacklogModule {}
