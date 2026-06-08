import { Module } from '@nestjs/common';
import { TaskController } from './taskController';
import { SprintController } from './sprintController';
import { BacklogService } from './backlogService';

// Plugin server entrypoint module. BacklogService owns its own pg Pool, so unlike the former core
// module this no longer imports InfrastructureModule — the plugin is fully self-contained.
@Module({
  controllers: [TaskController, SprintController],
  providers: [BacklogService],
  exports: [BacklogService],
})
export class BacklogModule {}
