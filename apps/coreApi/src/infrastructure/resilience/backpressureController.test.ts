import { describe, it, expect, beforeEach } from 'vitest';
import { BackpressureController, BackpressureZone } from './backpressureController';

describe('BackpressureController', () => {
  let controller: BackpressureController;

  beforeEach(() => {
    controller = new BackpressureController({
      maxConcurrent: 1000,
      maxQueueSize: 5000,
      name: 'test-backpressure',
      rejectThreshold: 4500,
      warnThreshold: 500,
    });
  });

  describe('checkCapacity', () => {
    it('should return GREEN zone when queue is below warn threshold', () => {
      const status = controller.checkCapacity(100);

      expect(status.zone).toBe(BackpressureZone.GREEN);
      expect(status.shouldReject).toBe(false);
      expect(status.utilizationPercent).toBeLessThan(10);
    });

    it('should return YELLOW zone when queue is above warn threshold', () => {
      const status = controller.checkCapacity(1000);

      expect(status.zone).toBe(BackpressureZone.YELLOW);
      expect(status.shouldReject).toBe(false);
    });

    it('should return RED zone and reject when queue is above reject threshold', () => {
      const status = controller.checkCapacity(4600);

      expect(status.zone).toBe(BackpressureZone.RED);
      expect(status.shouldReject).toBe(true);
    });

    it('should return BLACK zone when queue reaches max size', () => {
      const status = controller.checkCapacity(5000);

      expect(status.zone).toBe(BackpressureZone.BLACK);
      expect(status.shouldReject).toBe(false); // BLACK uses sync fallback
    });

    it('should calculate utilization percent correctly', () => {
      const status = controller.checkCapacity(2500);

      expect(status.currentLoad).toBe(2500);
      expect(status.maxLoad).toBe(6000);
      expect(status.utilizationPercent).toBeCloseTo(41.67, 1);
    });
  });

  describe('acquire and release', () => {
    it('should track concurrent operations', async () => {
      await controller.acquire();
      await controller.acquire();

      const status = controller.getStatus();
      expect(status.currentLoad).toBe(2);

      controller.release();
      const statusAfter = controller.getStatus();
      expect(statusAfter.currentLoad).toBe(1);
    });

    it('should reject when max concurrent is reached', async () => {
      for (let i = 0; i < 1000; i++) {
        await controller.acquire();
      }

      await expect(controller.acquire()).rejects.toThrow('Max concurrent limit reached');
    });

    it('should not go below zero on release', () => {
      controller.release();
      controller.release();

      const status = controller.getStatus();
      expect(status.currentLoad).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all counters', async () => {
      await controller.acquire();
      await controller.acquire();
      controller.checkCapacity(1000);

      controller.reset();

      const status = controller.getStatus();
      expect(status.currentLoad).toBe(0);
      expect(status.zone).toBe(BackpressureZone.GREEN);
    });
  });

  describe('zone transitions', () => {
    it('should transition through zones as load increases', () => {
      let status = controller.checkCapacity(100);
      expect(status.zone).toBe(BackpressureZone.GREEN);

      status = controller.checkCapacity(1000);
      expect(status.zone).toBe(BackpressureZone.YELLOW);

      status = controller.checkCapacity(4600);
      expect(status.zone).toBe(BackpressureZone.RED);

      status = controller.checkCapacity(5000);
      expect(status.zone).toBe(BackpressureZone.BLACK);
    });
  });
});
