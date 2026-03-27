import { Logger } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

export enum BackpressureZone {
  GREEN = 'green',
  YELLOW = 'yellow',
  RED = 'red',
  BLACK = 'black',
}

export interface BackpressureConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  warnThreshold: number;
  rejectThreshold: number;
  name: string;
}

export interface BackpressureStatus {
  zone: BackpressureZone;
  currentLoad: number;
  maxLoad: number;
  utilizationPercent: number;
  shouldReject: boolean;
}

export class BackpressureController {
  private static readonly meter = metrics.getMeter('core-api-resilience');
  private static readonly rejectionsCounter = BackpressureController.meter.createCounter(
    'backpressure_rejections_total',
    {
      description: 'Total requests rejected due to backpressure',
    }
  );
  private static readonly currentLoadGauge = BackpressureController.meter.createObservableGauge(
    'backpressure_load',
    {
      description: 'Current load on the backpressure controller',
    }
  );
  private static readonly zoneGauge = BackpressureController.meter.createObservableGauge(
    'backpressure_zone',
    {
      description: 'Current backpressure zone (0=GREEN, 1=YELLOW, 2=RED, 3=BLACK)',
    }
  );

  private readonly logger: Logger;
  private currentConcurrent = 0;
  private currentQueueSize = 0;
  private lastWarnTime = 0;
  private readonly warnIntervalMs = 5000;

  constructor(private readonly config: BackpressureConfig) {
    this.logger = new Logger(`BackpressureController:${config.name}`);
    this.registerMetrics();
  }

  checkCapacity(queueSize: number): BackpressureStatus {
    this.currentQueueSize = queueSize;
    const totalLoad = this.currentConcurrent + queueSize;
    const maxLoad = this.config.maxConcurrent + this.config.maxQueueSize;
    const utilizationPercent = (totalLoad / maxLoad) * 100;

    let zone: BackpressureZone;
    let shouldReject = false;

    if (queueSize >= this.config.maxQueueSize) {
      zone = BackpressureZone.BLACK;
      shouldReject = false; // BLACK zone uses synchronous fallback, not rejection
    } else if (queueSize >= this.config.rejectThreshold) {
      zone = BackpressureZone.RED;
      shouldReject = true;
      this.recordRejection('queue_full');
    } else if (queueSize >= this.config.warnThreshold) {
      zone = BackpressureZone.YELLOW;
      this.warnIfNeeded(queueSize);
    } else {
      zone = BackpressureZone.GREEN;
    }

    return {
      currentLoad: totalLoad,
      maxLoad,
      shouldReject,
      utilizationPercent,
      zone,
    };
  }

  async acquire(): Promise<void> {
    if (this.currentConcurrent >= this.config.maxConcurrent) {
      this.recordRejection('max_concurrent');
      throw new Error(`Max concurrent limit reached: ${this.config.maxConcurrent}`);
    }
    this.currentConcurrent += 1;
  }

  release(): void {
    if (this.currentConcurrent > 0) {
      this.currentConcurrent -= 1;
    }
  }

  getStatus(): BackpressureStatus {
    return this.checkCapacity(this.currentQueueSize);
  }

  reset(): void {
    this.currentConcurrent = 0;
    this.currentQueueSize = 0;
    this.lastWarnTime = 0;
    this.logger.log('Backpressure controller reset');
  }

  private recordRejection(reason: string): void {
    BackpressureController.rejectionsCounter.add(1, {
      name: this.config.name,
      reason,
    });
  }

  private warnIfNeeded(queueSize: number): void {
    const now = Date.now();
    if (now - this.lastWarnTime < this.warnIntervalMs) {
      return;
    }

    this.lastWarnTime = now;
    this.logger.warn(
      `Backpressure warning: queueSize=${queueSize}, warnThreshold=${this.config.warnThreshold}, rejectThreshold=${this.config.rejectThreshold}`
    );
  }

  private registerMetrics(): void {
    BackpressureController.currentLoadGauge.addCallback((observableResult) => {
      observableResult.observe(this.currentConcurrent + this.currentQueueSize, {
        name: this.config.name,
        type: 'total',
      });
      observableResult.observe(this.currentConcurrent, {
        name: this.config.name,
        type: 'concurrent',
      });
      observableResult.observe(this.currentQueueSize, {
        name: this.config.name,
        type: 'queued',
      });
    });

    BackpressureController.zoneGauge.addCallback((observableResult) => {
      const status = this.getStatus();
      const zoneValue = {
        [BackpressureZone.GREEN]: 0,
        [BackpressureZone.YELLOW]: 1,
        [BackpressureZone.RED]: 2,
        [BackpressureZone.BLACK]: 3,
      }[status.zone];

      observableResult.observe(zoneValue, {
        name: this.config.name,
      });
    });
  }
}
