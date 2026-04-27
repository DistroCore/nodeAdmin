import { describe, expect, it, vi } from 'vitest';
import type { ConnectionRegistry, SocketContext } from '../../../infrastructure/connectionRegistry';
import { ImPresenceService } from './imPresenceService';

function createMockPresenceService(): ImPresenceService {
  const connectionRegistry: Pick<ConnectionRegistry, 'countByTenant'> = {
    countByTenant: vi.fn<(tenantId: string) => number>().mockReturnValue(0),
  };

  const service = new ImPresenceService(connectionRegistry as unknown as ConnectionRegistry);

  return service;
}

function createContext(overrides?: Partial<SocketContext>): SocketContext {
  return {
    conversationId: 'conv-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('ImPresenceService', () => {
  it('createJoinedEvent returns correct shape', () => {
    const service = createMockPresenceService();
    const context = createContext();

    const event = service.createJoinedEvent(context);

    expect(event).toEqual({
      conversationId: 'conv-1',
      event: 'joined',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
  });

  it('createLeftEvent returns correct shape and clears status', () => {
    const service = createMockPresenceService();
    const context = createContext();

    service.setStatus('tenant-1', 'conv-1', 'user-1', 'away');
    expect(service.getStatus('tenant-1', 'conv-1', 'user-1')).toBe('away');

    const event = service.createLeftEvent(context);

    expect(event).toEqual({
      conversationId: 'conv-1',
      event: 'left',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(service.getStatus('tenant-1', 'conv-1', 'user-1')).toBe('online');
  });

  it('setStatus returns event with new status', () => {
    const service = createMockPresenceService();

    const event = service.setStatus('tenant-1', 'conv-1', 'user-1', 'dnd');

    expect(event).toEqual({
      conversationId: 'conv-1',
      status: 'dnd',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
  });

  it('getStatus defaults to online when no status set', () => {
    const service = createMockPresenceService();

    expect(service.getStatus('tenant-1', 'conv-1', 'user-1')).toBe('online');
  });

  it('getStatus returns last set status', () => {
    const service = createMockPresenceService();

    service.setStatus('tenant-1', 'conv-1', 'user-1', 'away');
    expect(service.getStatus('tenant-1', 'conv-1', 'user-1')).toBe('away');

    service.setStatus('tenant-1', 'conv-1', 'user-1', 'dnd');
    expect(service.getStatus('tenant-1', 'conv-1', 'user-1')).toBe('dnd');
  });

  it('status is isolated per user', () => {
    const service = createMockPresenceService();

    service.setStatus('tenant-1', 'conv-1', 'user-1', 'away');
    service.setStatus('tenant-1', 'conv-1', 'user-2', 'dnd');

    expect(service.getStatus('tenant-1', 'conv-1', 'user-1')).toBe('away');
    expect(service.getStatus('tenant-1', 'conv-1', 'user-2')).toBe('dnd');
  });

  it('status is isolated per conversation', () => {
    const service = createMockPresenceService();

    service.setStatus('tenant-1', 'conv-1', 'user-1', 'away');
    service.setStatus('tenant-1', 'conv-2', 'user-1', 'dnd');

    expect(service.getStatus('tenant-1', 'conv-1', 'user-1')).toBe('away');
    expect(service.getStatus('tenant-1', 'conv-2', 'user-1')).toBe('dnd');
  });

  it('status is isolated per tenant', () => {
    const service = createMockPresenceService();

    service.setStatus('tenant-1', 'conv-1', 'user-1', 'away');
    service.setStatus('tenant-2', 'conv-1', 'user-1', 'online');

    expect(service.getStatus('tenant-1', 'conv-1', 'user-1')).toBe('away');
    expect(service.getStatus('tenant-2', 'conv-1', 'user-1')).toBe('online');
  });
});
