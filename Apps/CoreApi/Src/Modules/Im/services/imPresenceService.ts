import { Injectable } from '@nestjs/common';
import { SocketContext } from '../../../Infrastructure/connectionRegistry';

@Injectable()
export class ImPresenceService {
  createJoinedEvent(context: SocketContext): {
    conversationId: string;
    event: 'joined';
    tenantId: string;
    userId: string;
  } {
    return {
      conversationId: context.conversationId,
      event: 'joined',
      tenantId: context.tenantId,
      userId: context.userId,
    };
  }
}
