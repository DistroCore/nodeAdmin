import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../Infrastructure/infrastructureModule';
import { AuthController } from './authController';
import { AuthService } from './authService';

@Module({
  imports: [InfrastructureModule],
  controllers: [AuthController],
  exports: [AuthService],
  providers: [AuthService],
})
export class AuthModule {}
