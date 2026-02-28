import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboxPublisherService } from '../Infrastructure/Outbox/outboxPublisherService';
import { AuthModule } from '../Modules/Auth/authModule';
import { ConsoleModule } from '../Modules/Console/consoleModule';
import { HealthModule } from '../Modules/Health/healthModule';
import { ImModule } from '../Modules/Im/imModule';

@Module({
  imports: [ConfigModule.forRoot({ cache: true, isGlobal: true }), HealthModule, AuthModule, ImModule, ConsoleModule],
  providers: [OutboxPublisherService],
})
export class AppModule {}
