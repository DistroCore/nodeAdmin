import { Logger } from '@nestjs/common';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { runtimeConfig } from '../../App/runtimeConfig';

const logger = new Logger('Telemetry');

let sdk: NodeSDK | null = null;

export async function startTelemetry(): Promise<void> {
  if (!runtimeConfig.telemetry.enabled) {
    return;
  }

  process.env.OTEL_SERVICE_NAME = runtimeConfig.telemetry.serviceName;

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const metricReader = new PrometheusExporter({
    endpoint: '/metrics',
    port: runtimeConfig.telemetry.metricsPort,
  });
  const traceExporter = runtimeConfig.telemetry.otlpEndpoint
    ? new OTLPTraceExporter({
        url: `${runtimeConfig.telemetry.otlpEndpoint.replace(/\/$/, '')}/v1/traces`,
      })
    : undefined;

  sdk = new NodeSDK({
    instrumentations: [getNodeAutoInstrumentations()],
    metricReader,
    traceExporter,
  });

  await sdk.start();
  logger.log(
    `OpenTelemetry started (service=${runtimeConfig.telemetry.serviceName}, metrics=:${runtimeConfig.telemetry.metricsPort}).`,
  );
}

export async function stopTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  await sdk.shutdown();
  sdk = null;
}
