import { Module } from '@nestjs/common';
import { AuthModule } from '../Auth/authModule';
import { ConnectionRegistry } from '../../infrastructure/connectionRegistry';
import { InMemoryMessageStore } from '../../infrastructure/inMemoryMessageStore';
import { ImMessageRepository } from '../../infrastructure/database/imMessageRepository';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { WsTenantGuard } from './guards/wsTenantGuard';
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
