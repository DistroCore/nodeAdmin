import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerState } from './circuitBreaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      halfOpenMaxAttempts: 3,
      name: 'test-circuit',
      successThreshold: 2,
      timeout: 1000,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('CLOSED state', () => {
    it('should allow requests when circuit is closed', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'));

      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.getMetrics().consecutiveFailures).toBe(5);
    });

    it('should reset consecutive failures on success', async () => {
      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      const successOp = vi.fn().mockResolvedValue('success');

      await expect(circuitBreaker.execute(failOp)).rejects.toThrow('failure');
      await expect(circuitBreaker.execute(failOp)).rejects.toThrow('failure');
      expect(circuitBreaker.getMetrics().consecutiveFailures).toBe(2);

      await circuitBreaker.execute(successOp);
      expect(circuitBreaker.getMetrics().consecutiveFailures).toBe(0);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
      }
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject requests immediately when circuit is open', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      vi.useFakeTimers();
      const operation = vi.fn().mockResolvedValue('success');

      vi.advanceTimersByTime(1000);

      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      expect(operation).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should stay OPEN just before timeout and allow execution at the exact timeout boundary', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

      const boundaryCircuit = new CircuitBreaker({
        failureThreshold: 1,
        halfOpenMaxAttempts: 1,
        name: 'test-open-boundary',
        successThreshold: 1,
        timeout: 1000,
      });
      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      const successOp = vi.fn().mockResolvedValue('success');

      await expect(boundaryCircuit.execute(failOp)).rejects.toThrow('failure');
      vi.advanceTimersByTime(999);
      await expect(boundaryCircuit.execute(successOp)).rejects.toThrow('Circuit breaker is OPEN');

      vi.advanceTimersByTime(1);
      await expect(boundaryCircuit.execute(successOp)).resolves.toBe('success');
      expect(boundaryCircuit.getState()).toBe(CircuitBreakerState.CLOSED);

      vi.useRealTimers();
    });
  });

  describe('HALF_OPEN state', () => {
    it('should transition to CLOSED after threshold successes', async () => {
      const testCircuit = new CircuitBreaker({
        failureThreshold: 5,
        halfOpenMaxAttempts: 3,
        name: 'test-half-open-1',
        successThreshold: 2,
        timeout: 100,
      });

      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 5; i++) {
        await expect(testCircuit.execute(failOp)).rejects.toThrow('failure');
      }
      expect(testCircuit.getState()).toBe(CircuitBreakerState.OPEN);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const operation = vi.fn().mockResolvedValue('success');

      await testCircuit.execute(operation);
      expect(testCircuit.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      await testCircuit.execute(operation);
      expect(testCircuit.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(testCircuit.getMetrics().consecutiveSuccesses).toBe(2);
    });

    it('should transition back to OPEN on failure', async () => {
      const testCircuit = new CircuitBreaker({
        failureThreshold: 5,
        halfOpenMaxAttempts: 3,
        name: 'test-half-open-2',
        successThreshold: 2,
        timeout: 100,
      });

      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 5; i++) {
        await expect(testCircuit.execute(failOp)).rejects.toThrow('failure');
      }
      expect(testCircuit.getState()).toBe(CircuitBreakerState.OPEN);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const successOp = vi.fn().mockResolvedValue('success');

      await testCircuit.execute(successOp);
      expect(testCircuit.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      await expect(testCircuit.execute(failOp)).rejects.toThrow('failure');
      expect(testCircuit.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should limit concurrent attempts in half-open state', async () => {
      const testCircuit = new CircuitBreaker({
        failureThreshold: 5,
        halfOpenMaxAttempts: 3,
        name: 'test-half-open-3',
        successThreshold: 5,
        timeout: 100,
      });

      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 5; i++) {
        await expect(testCircuit.execute(failOp)).rejects.toThrow('failure');
      }
      expect(testCircuit.getState()).toBe(CircuitBreakerState.OPEN);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const operation = vi.fn().mockResolvedValue('success');

      await testCircuit.execute(operation);
      expect(testCircuit.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      await testCircuit.execute(operation);
      expect(testCircuit.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      await testCircuit.execute(operation);
      expect(testCircuit.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      await expect(testCircuit.execute(operation)).rejects.toThrow('max attempts reached');
    });

    it('should allow only the configured number of concurrent half-open attempts', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

      const deferredCircuit = new CircuitBreaker({
        failureThreshold: 1,
        halfOpenMaxAttempts: 2,
        name: 'test-half-open-concurrency',
        successThreshold: 2,
        timeout: 1000,
      });
      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      await expect(deferredCircuit.execute(failOp)).rejects.toThrow('failure');

      vi.advanceTimersByTime(1000);

      const firstDeferred = createDeferred<string>();
      const secondDeferred = createDeferred<string>();
      const first = deferredCircuit.execute(() => firstDeferred.promise);
      const second = deferredCircuit.execute(() => secondDeferred.promise);

      await expect(deferredCircuit.execute(async () => 'third')).rejects.toThrow('max attempts reached');

      firstDeferred.resolve('first');
      secondDeferred.resolve('second');

      await expect(first).resolves.toBe('first');
      await expect(second).resolves.toBe('second');
      expect(deferredCircuit.getState()).toBe(CircuitBreakerState.CLOSED);

      vi.useRealTimers();
    });

    it('should reopen on half-open failure and allow a fresh probe after the next timeout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

      const retryCircuit = new CircuitBreaker({
        failureThreshold: 1,
        halfOpenMaxAttempts: 1,
        name: 'test-half-open-retry',
        successThreshold: 1,
        timeout: 1000,
      });
      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      const successOp = vi.fn().mockResolvedValue('success');

      await expect(retryCircuit.execute(failOp)).rejects.toThrow('failure');
      vi.advanceTimersByTime(1000);
      await expect(retryCircuit.execute(failOp)).rejects.toThrow('failure');
      expect(retryCircuit.getState()).toBe(CircuitBreakerState.OPEN);

      vi.advanceTimersByTime(1000);
      await expect(retryCircuit.execute(successOp)).resolves.toBe('success');
      expect(retryCircuit.getState()).toBe(CircuitBreakerState.CLOSED);

      vi.useRealTimers();
    });
  });

  describe('concurrency', () => {
    it('should transition to OPEN when concurrent failures push the breaker over the threshold', async () => {
      const concurrentCircuit = new CircuitBreaker({
        failureThreshold: 2,
        halfOpenMaxAttempts: 1,
        name: 'test-concurrent-failures',
        successThreshold: 1,
        timeout: 1000,
      });

      const results = await Promise.allSettled([
        concurrentCircuit.execute(async () => {
          throw new Error('failure-1');
        }),
        concurrentCircuit.execute(async () => {
          throw new Error('failure-2');
        }),
      ]);

      expect(results.every((result) => result.status === 'rejected')).toBe(true);
      expect(concurrentCircuit.getState()).toBe(CircuitBreakerState.OPEN);
      expect(concurrentCircuit.getMetrics().consecutiveFailures).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to initial state', async () => {
      const failOp = vi.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(failOp)).rejects.toThrow('failure');
      }
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getMetrics().consecutiveFailures).toBe(0);
      expect(circuitBreaker.getMetrics().failures).toBe(0);
    });
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}
