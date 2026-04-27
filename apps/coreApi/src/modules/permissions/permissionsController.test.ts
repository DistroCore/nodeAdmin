import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsController } from './permissionsController';

function createMockPermissionsService() {
  return {
    findAll: vi.fn(),
    findByModule: vi.fn(),
  };
}

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let permissionsService: ReturnType<typeof createMockPermissionsService>;

  beforeEach(() => {
    permissionsService = createMockPermissionsService();
    controller = new PermissionsController(permissionsService as never);
  });

  it('delegates findAll with the default tenantId', async () => {
    permissionsService.findAll.mockResolvedValue([{ id: 'permission-1' }]);

    const result = await controller.findAll();

    expect(permissionsService.findAll).toHaveBeenCalledWith('default');
    expect(result).toEqual([{ id: 'permission-1' }]);
  });

  it('passes tenantId through to findAll when provided', async () => {
    permissionsService.findAll.mockResolvedValue([]);

    await controller.findAll('tenant-1');

    expect(permissionsService.findAll).toHaveBeenCalledWith('tenant-1');
  });

  it('delegates findByModule with the default tenantId', async () => {
    permissionsService.findByModule.mockResolvedValue([{ id: 'permission-2', module: 'im' }]);

    const result = await controller.findByModule('im');

    expect(permissionsService.findByModule).toHaveBeenCalledWith('default', 'im');
    expect(result).toEqual([{ id: 'permission-2', module: 'im' }]);
  });

  it('passes through module names and tenantId when provided', async () => {
    permissionsService.findByModule.mockResolvedValue([{ id: 'permission-3', module: 'im:admin' }]);

    const result = await controller.findByModule('im:admin', 'tenant-2');

    expect(permissionsService.findByModule).toHaveBeenCalledWith('tenant-2', 'im:admin');
    expect(result[0]?.module).toBe('im:admin');
  });

  it('propagates service errors from findAll', async () => {
    permissionsService.findAll.mockRejectedValue(new Error('permissions unavailable'));

    await expect(controller.findAll()).rejects.toThrow('permissions unavailable');
  });

  it('propagates service errors from findByModule', async () => {
    permissionsService.findByModule.mockRejectedValue(new Error('module lookup failed'));

    await expect(controller.findByModule('users')).rejects.toThrow('module lookup failed');
  });
});
