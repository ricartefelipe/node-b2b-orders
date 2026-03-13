import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

const OTEL_ENABLED = process.env.OTEL_ENABLED !== 'false';
const OTEL_DEBUG = process.env.OTEL_LOG_LEVEL === 'debug';

if (OTEL_DEBUG) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

let sdk: NodeSDK | undefined;

if (OTEL_ENABLED) {
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';

  const exporter = new OTLPTraceExporter({ url: endpoint });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'node-b2b-orders',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    }),
    traceExporter: exporter,
    instrumentations: [new HttpInstrumentation(), new FastifyInstrumentation()],
  });

  sdk.start();
  console.log(`[tracing] OpenTelemetry started — exporting to ${endpoint}`);

  const shutdown = () => {
    sdk
      ?.shutdown()
      .then(() => console.log('[tracing] OpenTelemetry shut down'))
      .catch((err) => console.error('[tracing] shutdown error', err));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  console.log('[tracing] OpenTelemetry disabled (OTEL_ENABLED=false)');
}

export { sdk };
