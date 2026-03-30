import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DegradationManager, DegradationFeature } from './degradationManager';

describe('DegradationManager', () => {
  let manager: DegradationManager;

  beforeEach(() => {
    manager = new DegradationManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('degrade', () => {
    it('should degrade a feature', () => {
      manager.degrade(DegradationFeature.REDIS_ADAPTER, 'Redis connection failed');

      expect(manager.isDegraded(DegradationFeature.REDIS_ADAPTER)).toBe(true);
      const status = manager.getStatus(DegradationFeature.REDIS_ADAPTER);
      expect(status?.reason).toBe('Redis connection failed');
      expect(status?.degradedAt).toBeGreaterThan(0);
    });

    it('should not degrade twice', () => {
      manager.degrade(DegradationFeature.KAFKA_OUTBOX, 'Kafka unavailable');
      const firstStatus = manager.getStatus(DegradationFeature.KAFKA_OUTBOX);

      manager.degrade(DegradationFeature.KAFKA_OUTBOX, 'Kafka still unavailable');
      const secondStatus = manager.getStatus(DegradationFeature.KAFKA_OUTBOX);

      expect(firstStatus?.degradedAt).toBe(secondStatus?.degradedAt);
      expect(secondStatus?.reason).toBe('Kafka unavailable');
    });

    it('should degrade multiple features independently', () => {
      manager.degrade(DegradationFeature.REDIS_ADAPTER, 'Redis failed');
      manager.degrade(DegradationFeature.AUDIT_LOG, 'Audit log disabled');

      expect(manager.isDegraded(DegradationFeature.REDIS_ADAPTER)).toBe(true);
      expect(manager.isDegraded(DegradationFeature.AUDIT_LOG)).toBe(true);
      expect(manager.isDegraded(DegradationFeature.KAFKA_OUTBOX)).toBe(false);
    });
  });

  describe('restore', () => {
    it('should restore a degraded feature', () => {
      manager.degrade(DegradationFeature.TYPING_EVENTS, 'High load');
      expect(manager.isDegraded(DegradationFeature.TYPING_EVENTS)).toBe(true);

      manager.restore(DegradationFeature.TYPING_EVENTS);
      expect(manager.isDegraded(DegradationFeature.TYPING_EVENTS)).toBe(false);

      const status = manager.getStatus(DegradationFeature.TYPING_EVENTS);
      expect(status?.reason).toBeNull();
      expect(status?.degradedAt).toBeNull();
    });

    it('should not fail when restoring non-degraded feature', () => {
      expect(() => {
        manager.restore(DegradationFeature.REDIS_ADAPTER);
      }).not.toThrow();

      expect(manager.isDegraded(DegradationFeature.REDIS_ADAPTER)).toBe(false);
    });
  });

  describe('getAllStatus', () => {
    it('should return status for all features', () => {
      manager.degrade(DegradationFeature.REDIS_ADAPTER, 'Redis failed');
      manager.degrade(DegradationFeature.KAFKA_OUTBOX, 'Kafka failed');

      const allStatus = manager.getAllStatus();

      expect(allStatus).toHaveLength(4);
      expect(allStatus.filter((s) => s.degraded)).toHaveLength(2);
      expect(allStatus.filter((s) => !s.degraded)).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('should restore all degraded features', () => {
      manager.degrade(DegradationFeature.REDIS_ADAPTER, 'Redis failed');
      manager.degrade(DegradationFeature.KAFKA_OUTBOX, 'Kafka failed');
      manager.degrade(DegradationFeature.AUDIT_LOG, 'Audit disabled');

      manager.reset();

      expect(manager.isDegraded(DegradationFeature.REDIS_ADAPTER)).toBe(false);
      expect(manager.isDegraded(DegradationFeature.KAFKA_OUTBOX)).toBe(false);
      expect(manager.isDegraded(DegradationFeature.AUDIT_LOG)).toBe(false);
      expect(manager.isDegraded(DegradationFeature.TYPING_EVENTS)).toBe(false);
    });
  });

  describe('restoreExpired', () => {
    it('should restore only features that exceeded the recovery window', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

      manager.degrade(DegradationFeature.REDIS_ADAPTER, 'Redis failed');
      vi.advanceTimersByTime(2000);
      manager.degrade(DegradationFeature.KAFKA_OUTBOX, 'Kafka failed');

      const restored = manager.restoreExpired(1500);

      expect(restored).toEqual([DegradationFeature.REDIS_ADAPTER]);
      expect(manager.isDegraded(DegradationFeature.REDIS_ADAPTER)).toBe(false);
      expect(manager.isDegraded(DegradationFeature.KAFKA_OUTBOX)).toBe(true);
    });

    it('should return an empty list when no features qualify for automatic recovery', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

      manager.degrade(DegradationFeature.AUDIT_LOG, 'Audit disabled');
      vi.advanceTimersByTime(500);

      expect(manager.restoreExpired(1000)).toEqual([]);
      expect(manager.isDegraded(DegradationFeature.AUDIT_LOG)).toBe(true);
    });

    it('should restore multiple expired features independently in one sweep', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

      manager.degrade(DegradationFeature.REDIS_ADAPTER, 'Redis failed');
      manager.degrade(DegradationFeature.AUDIT_LOG, 'Audit disabled');
      vi.advanceTimersByTime(2000);

      const restored = manager.restoreExpired(1000);

      expect(restored).toEqual([
        DegradationFeature.REDIS_ADAPTER,
        DegradationFeature.AUDIT_LOG,
      ]);
      expect(manager.isDegraded(DegradationFeature.REDIS_ADAPTER)).toBe(false);
      expect(manager.isDegraded(DegradationFeature.AUDIT_LOG)).toBe(false);
    });

    it('should leave unrelated features untouched when restoring expired ones', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

      manager.degrade(DegradationFeature.REDIS_ADAPTER, 'Redis failed');
      vi.advanceTimersByTime(1500);
      manager.degrade(DegradationFeature.TYPING_EVENTS, 'High load');

      manager.restoreExpired(1000);

      expect(manager.getStatus(DegradationFeature.REDIS_ADAPTER)?.reason).toBeNull();
      expect(manager.getStatus(DegradationFeature.TYPING_EVENTS)?.reason).toBe('High load');
    });
  });

  describe('getStatus', () => {
    it('should return null for invalid feature', () => {
      const status = manager.getStatus('invalid_feature' as DegradationFeature);
      expect(status).toBeNull();
    });

    it('should return immutable status copy', () => {
      manager.degrade(DegradationFeature.REDIS_ADAPTER, 'Redis failed');
      const status = manager.getStatus(DegradationFeature.REDIS_ADAPTER);

      if (status) {
        status.degraded = false;
      }

      expect(manager.isDegraded(DegradationFeature.REDIS_ADAPTER)).toBe(true);
    });
  });
});
