import { describe, it, expect, beforeEach } from 'vitest';
import { DegradationManager, DegradationFeature } from './degradationManager';

describe('DegradationManager', () => {
  let manager: DegradationManager;

  beforeEach(() => {
    manager = new DegradationManager();
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
