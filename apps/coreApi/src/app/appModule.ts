import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboxPublisherService } from '../infrastructure/outbox/outboxPublisherService';
import { AuthModule } from '../modules/auth/authModule';
import { ConsoleModule } from '../modules/console/consoleModule';
import { HealthModule } from '../modules/health/healthModule';
import { ImModule } from '../modules/im/imModule';

@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true }),
    HealthModule,
    AuthModule,
    ImModule,
    ConsoleModule,
  ],
  providers: [OutboxPublisherService],
})
export class AppModule {}
