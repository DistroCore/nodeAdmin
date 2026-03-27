import { Logger } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

export enum CircuitBreakerState {
  CLOSED = 0,
  OPEN = 1,
  HALF_OPEN = 2,
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenMaxAttempts: number;
  name: string;
}

interface CircuitBreakerMetrics {
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime: number | null;
  lastStateChange: number;
}

export class CircuitBreaker {
  private static readonly meter = metrics.getMeter('core-api-resilience');
  private static readonly stateGauge = CircuitBreaker.meter.createObservableGauge(
    'circuit_breaker_state',
    {
      description: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
    }
  );
  private static readonly tripsCounter = CircuitBreaker.meter.createCounter(
    'circuit_breaker_trips_total',
    {
      description: 'Total number of circuit breaker trips',
    }
  );
  private static readonly requestsCounter = CircuitBreaker.meter.createCounter(
    'circuit_breaker_requests_total',
    {
      description: 'Total requests through circuit breaker',
    }
  );

  private readonly logger: Logger;
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private metrics: CircuitBreakerMetrics = {
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    failures: 0,
    lastFailureTime: null,
    lastStateChange: Date.now(),
    successes: 0,
  };
  private halfOpenAttempts = 0;

  constructor(private readonly config: CircuitBreakerConfig) {
    this.logger = new Logger(`CircuitBreaker:${config.name}`);
    this.registerMetrics();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.metrics.lastStateChange < this.config.timeout) {
        CircuitBreaker.requestsCounter.add(1, {
          name: this.config.name,
          result: 'rejected',
          state: 'open',
        });
        throw new Error(`Circuit breaker is OPEN for ${this.config.name}`);
      }

      this.transitionTo(CircuitBreakerState.HALF_OPEN);
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        CircuitBreaker.requestsCounter.add(1, {
          name: this.config.name,
          result: 'rejected',
          state: 'half_open',
        });
        throw new Error(
          `Circuit breaker is HALF_OPEN and max attempts reached for ${this.config.name}`
        );
      }
      this.halfOpenAttempts += 1;
    }

    try {
      const result = await operation();
      this.onSuccess();
      CircuitBreaker.requestsCounter.add(1, {
        name: this.config.name,
        result: 'success',
        state: CircuitBreakerState[this.state].toLowerCase(),
      });
      return result;
    } catch (error) {
      this.onFailure();
      CircuitBreaker.requestsCounter.add(1, {
        name: this.config.name,
        result: 'failure',
        state: CircuitBreakerState[this.state].toLowerCase(),
      });
      throw error;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics(): Readonly<CircuitBreakerMetrics> {
    return { ...this.metrics };
  }

  reset(): void {
    this.transitionTo(CircuitBreakerState.CLOSED);
    this.metrics = {
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      failures: 0,
      lastFailureTime: null,
      lastStateChange: Date.now(),
      successes: 0,
    };
    this.halfOpenAttempts = 0;
    this.logger.log('Circuit breaker manually reset');
  }

  private onSuccess(): void {
    this.metrics.successes += 1;
    this.metrics.consecutiveSuccesses += 1;
    this.metrics.consecutiveFailures = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.metrics.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitBreakerState.CLOSED);
        this.halfOpenAttempts = 0;
      }
    }
  }

  private onFailure(): void {
    this.metrics.failures += 1;
    this.metrics.consecutiveFailures += 1;
    this.metrics.consecutiveSuccesses = 0;
    this.metrics.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.CLOSED) {
      if (this.metrics.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionTo(CircuitBreakerState.OPEN);
        CircuitBreaker.tripsCounter.add(1, {
          name: this.config.name,
        });
      }
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionTo(CircuitBreakerState.OPEN);
      this.halfOpenAttempts = 0;
      CircuitBreaker.tripsCounter.add(1, {
        name: this.config.name,
      });
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.metrics.lastStateChange = Date.now();

    this.logger.log(
      `Circuit breaker transitioned: ${CircuitBreakerState[oldState]} → ${CircuitBreakerState[newState]}`
    );
  }

  private registerMetrics(): void {
    CircuitBreaker.stateGauge.addCallback((observableResult) => {
      observableResult.observe(this.state, {
        name: this.config.name,
      });
    });
  }
}
