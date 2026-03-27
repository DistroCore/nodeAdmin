import { Logger } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

export enum DegradationFeature {
  REDIS_ADAPTER = 'redis_adapter',
  KAFKA_OUTBOX = 'kafka_outbox',
  AUDIT_LOG = 'audit_log',
  TYPING_EVENTS = 'typing_events',
}

export interface DegradationStatus {
  feature: DegradationFeature;
  degraded: boolean;
  reason: string | null;
  degradedAt: number | null;
}

export class DegradationManager {
  private static readonly meter = metrics.getMeter('core-api-resilience');
  private static readonly degradationGauge = DegradationManager.meter.createObservableGauge(
    'degradation_active',
    {
      description: 'Whether a feature is currently degraded (1=degraded, 0=normal)',
    }
  );
  private static readonly degradationCounter = DegradationManager.meter.createCounter(
    'degradation_events_total',
    {
      description: 'Total number of degradation events',
    }
  );

  private readonly logger = new Logger(DegradationManager.name);
  private readonly degradationState = new Map<DegradationFeature, DegradationStatus>();

  constructor() {
    for (const feature of Object.values(DegradationFeature)) {
      this.degradationState.set(feature, {
        degraded: false,
        degradedAt: null,
        feature,
        reason: null,
      });
    }
    this.registerMetrics();
  }

  degrade(feature: DegradationFeature, reason: string): void {
    const status = this.degradationState.get(feature);
    if (!status) {
      return;
    }

    if (status.degraded) {
      return;
    }

    status.degraded = true;
    status.reason = reason;
    status.degradedAt = Date.now();
    this.degradationState.set(feature, status);

    DegradationManager.degradationCounter.add(1, {
      action: 'degrade',
      feature,
    });

    this.logger.warn(`Feature degraded: ${feature} - ${reason}`);
  }

  restore(feature: DegradationFeature): void {
    const status = this.degradationState.get(feature);
    if (!status) {
      return;
    }

    if (!status.degraded) {
      return;
    }

    const degradedDuration = status.degradedAt ? Date.now() - status.degradedAt : 0;
    status.degraded = false;
    status.reason = null;
    status.degradedAt = null;
    this.degradationState.set(feature, status);

    DegradationManager.degradationCounter.add(1, {
      action: 'restore',
      feature,
    });

    this.logger.log(`Feature restored: ${feature} (degraded for ${degradedDuration}ms)`);
  }

  isDegraded(feature: DegradationFeature): boolean {
    const status = this.degradationState.get(feature);
    return status?.degraded ?? false;
  }

  getStatus(feature: DegradationFeature): DegradationStatus | null {
    const status = this.degradationState.get(feature);
    return status ? { ...status } : null;
  }

  getAllStatus(): DegradationStatus[] {
    return Array.from(this.degradationState.values()).map((status) => ({ ...status }));
  }

  reset(): void {
    for (const feature of Object.values(DegradationFeature)) {
      this.restore(feature);
    }
    this.logger.log('All features restored');
  }

  private registerMetrics(): void {
    DegradationManager.degradationGauge.addCallback((observableResult) => {
      for (const [feature, status] of this.degradationState.entries()) {
        observableResult.observe(status.degraded ? 1 : 0, {
          feature,
        });
      }
    });
  }
}
