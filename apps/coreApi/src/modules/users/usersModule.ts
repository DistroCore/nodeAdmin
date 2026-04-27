import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { UsersController } from './usersController';
import { UsersService } from './usersService';

@Module({
  imports: [InfrastructureModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
