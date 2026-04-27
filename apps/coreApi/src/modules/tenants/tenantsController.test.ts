import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantsController } from './tenantsController';
import { TenantsService } from './tenantsService';
import { CreateTenantDto } from './dto/createTenantDto';
import { UpdateTenantDto } from './dto/updateTenantDto';

function createMockTenantsService() {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
}

describe('TenantsController', () => {
  let controller: TenantsController;
  let service: ReturnType<typeof createMockTenantsService>;

  beforeEach(() => {
    service = createMockTenantsService();
    controller = new TenantsController(service as unknown as TenantsService);
  });

  describe('list', () => {
    it('should delegate to service', async () => {
      service.list.mockResolvedValue([]);
      const result = await controller.list();
      expect(service.list).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should delegate to service with id', async () => {
      service.findById.mockResolvedValue({ id: 't-1' });
      const result = await controller.findOne('t-1');
      expect(service.findById).toHaveBeenCalledWith('t-1');
      expect(result).toEqual({ id: 't-1' });
    });
  });

  describe('create', () => {
    it('should delegate to service with dto fields', async () => {
      service.create.mockResolvedValue({ id: 't-1' });
      const dto: CreateTenantDto = {
        name: 'T',
        slug: 't',
        logo: 'logo.png',
        isActive: true,
      };

      await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith({
        name: 'T',
        slug: 't',
        logo: 'logo.png',
        isActive: true,
      });
    });
  });

  describe('update', () => {
    it('should delegate to service with mapped data', async () => {
      service.update.mockResolvedValue({ id: 't-1' });
      const dto: UpdateTenantDto = { name: 'Updated' };

      await controller.update('t-1', dto);
      expect(service.update).toHaveBeenCalledWith('t-1', {
        name: 'Updated',
        logo: undefined,
        isActive: undefined,
      });
    });
  });

  describe('remove', () => {
    it('should delegate and return success', async () => {
      service.remove.mockResolvedValue(undefined);
      const result = await controller.remove('t-1');
      expect(service.remove).toHaveBeenCalledWith('t-1');
      expect(result).toEqual({ success: true });
    });
  });
});
