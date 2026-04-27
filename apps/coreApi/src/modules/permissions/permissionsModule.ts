import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { PermissionsController } from './permissionsController';
import { PermissionsService } from './permissionsService';

@Module({
  imports: [InfrastructureModule],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
