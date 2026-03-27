import { WsException } from '@nestjs/websockets';
import { describe, expect, it } from 'vitest';
import { ConnectionRegistry, SocketContext } from './connectionRegistry';

interface RegistryTestAccess {
  countByTenant(tenantId: string): number;
  countByTenantId: Map<string, number>;
  get(socketId: string): SocketContext | undefined;
  remove(socketId: string): void;
  upsert(socketId: string, context: SocketContext): void;
}

function createContext(tenantId: string, conversationId: string, userId = 'user-1'): SocketContext {
  return {
    conversationId,
    tenantId,
    userId,
  };
}

describe('ConnectionRegistry', () => {
  it('supports upsert/get and remove lifecycle', () => {
    const registry = new ConnectionRegistry();
    const context = createContext('tenant-1', 'conversation-1');

    registry.upsert('socket-a', context);
    expect(registry.get('socket-a')).toEqual(context);

    registry.remove('socket-a');
    expect(registry.get('socket-a')).toBeUndefined();
  });

  it('tracks countByTenant and decrements after remove', () => {
    const registry = new ConnectionRegistry() as unknown as RegistryTestAccess;

    registry.upsert('socket-a', createContext('tenant-1', 'conversation-1'));
    registry.upsert('socket-b', createContext('tenant-1', 'conversation-2'));
    registry.upsert('socket-c', createContext('tenant-1', 'conversation-3'));

    expect(registry.countByTenant('tenant-1')).toBe(3);

    registry.remove('socket-b');
    expect(registry.countByTenant('tenant-1')).toBe(2);
  });

  it('rejects upsert when tenant connections reach limit', () => {
    const registry = new ConnectionRegistry() as unknown as RegistryTestAccess;
    const maxConnectionsPerTenant = (
      ConnectionRegistry as unknown as { MAX_CONNECTIONS_PER_TENANT: number }
    ).MAX_CONNECTIONS_PER_TENANT;

    registry.countByTenantId.set('tenant-x', maxConnectionsPerTenant);

    expect(() =>
      registry.upsert('socket-z', createContext('tenant-x', 'conversation-z'))
    ).toThrowError(WsException);

    expect(() =>
      registry.upsert('socket-z', createContext('tenant-x', 'conversation-z'))
    ).toThrowError(/limit/i);
  });

  it('does not increase count when existing socket rejoins same tenant', () => {
    const registry = new ConnectionRegistry() as unknown as RegistryTestAccess;

    registry.upsert('socket-a', createContext('tenant-1', 'conversation-1'));
    expect(registry.countByTenant('tenant-1')).toBe(1);

    registry.upsert('socket-a', createContext('tenant-1', 'conversation-2'));
    expect(registry.countByTenant('tenant-1')).toBe(1);
  });

  it('moves counts correctly when socket switches tenant', () => {
    const registry = new ConnectionRegistry() as unknown as RegistryTestAccess;

    registry.upsert('socket-a', createContext('tenant-1', 'conversation-1'));
    expect(registry.countByTenant('tenant-1')).toBe(1);

    registry.upsert('socket-a', createContext('tenant-2', 'conversation-2'));
    expect(registry.countByTenant('tenant-1')).toBe(0);
    expect(registry.countByTenant('tenant-2')).toBe(1);
  });
});
