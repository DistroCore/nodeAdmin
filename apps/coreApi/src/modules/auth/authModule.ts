import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { OAuthAccountRepository } from '../../infrastructure/database/oauthAccountRepository';
import { SmsCodeRepository } from '../../infrastructure/database/smsCodeRepository';
import { UserRepository } from '../../infrastructure/database/userRepository';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { AuthController } from './authController';
import { AuthService } from './authService';

@Module({
  imports: [InfrastructureModule],
  controllers: [AuthController],
  exports: [AuthService],
  providers: [
    // Repositories receive the pg Pool directly (via DatabaseService.drizzle.$client) instead of
    // depending on DatabaseService itself — same pattern as imModule's repositories. Keeps the
    // controller→service→repository layering clean: repositories depend on a connection, not a
    // service. See ImMessageRepository header for the rationale on the raw-Pool style.
    {
      provide: UserRepository,
      useFactory: (databaseService: DatabaseService) =>
        new UserRepository((databaseService.drizzle?.$client as Pool | undefined) ?? null),
      inject: [DatabaseService],
    },
    {
      provide: OAuthAccountRepository,
      useFactory: (databaseService: DatabaseService) =>
        new OAuthAccountRepository((databaseService.drizzle?.$client as Pool | undefined) ?? null),
      inject: [DatabaseService],
    },
    {
      provide: SmsCodeRepository,
      useFactory: (databaseService: DatabaseService) =>
        new SmsCodeRepository((databaseService.drizzle?.$client as Pool | undefined) ?? null),
      inject: [DatabaseService],
    },
    AuthService,
  ],
})
export class AuthModule {}
