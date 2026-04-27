import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { TenantsController } from './tenantsController';
import { TenantsService } from './tenantsService';

@Module({
  imports: [InfrastructureModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
