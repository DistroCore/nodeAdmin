import { Module } from '@nestjs/common';
import { AuthModule } from '../Auth/authModule';
import { ConnectionRegistry } from '../../Infrastructure/connectionRegistry';
import { InMemoryMessageStore } from '../../Infrastructure/inMemoryMessageStore';
import { ImMessageRepository } from '../../Infrastructure/Database/imMessageRepository';
import { InfrastructureModule } from '../../Infrastructure/infrastructureModule';
import { WsTenantGuard } from './Guards/wsTenantGuard';
import { ImGateway } from './imGateway';
import { ImConversationService } from './services/imConversationService';
import { ImMessageService } from './services/imMessageService';
import { ImPresenceService } from './services/imPresenceService';

@Module({
  imports: [AuthModule, InfrastructureModule],
  providers: [
    ImGateway,
    WsTenantGuard,
    ConnectionRegistry,
    InMemoryMessageStore,
    ImMessageRepository,
    ImConversationService,
    ImMessageService,
    ImPresenceService,
  ],
})
export class ImModule {}
