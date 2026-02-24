import CircuitBreaker, { CircuitBreakerOptions, CircuitBreakerState } from 'opossum';
import { Counter, Gauge } from 'prom-client';

export interface BreakerMetrics {
  fires: Counter<string>;
  successes: Counter<string>;
  failures: Counter<string>;
  rejects: Counter<string>;
  timeouts: Counter<string>;
  fallbacks: Counter<string>;
  state: Gauge<string>;
}

const STATE_MAP: Record<CircuitBreakerState, number> = {
  closed: 0,
  halfOpen: 1,
  open: 2,
};

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  timeout: 5_000,
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
  rollingCountTimeout: 10_000,
  rollingCountBuckets: 10,
  volumeThreshold: 5,
};

let sharedMetrics: BreakerMetrics | null = null;

function getSharedMetrics(): BreakerMetrics {
  if (sharedMetrics) return sharedMetrics;

  sharedMetrics = {
    fires: new Counter({
      name: 'circuit_breaker_fires_total',
      help: 'Total calls through circuit breakers',
      labelNames: ['breaker'],
    }),
    successes: new Counter({
      name: 'circuit_breaker_successes_total',
      help: 'Successful calls through circuit breakers',
      labelNames: ['breaker'],
    }),
    failures: new Counter({
      name: 'circuit_breaker_failures_total',
      help: 'Failed calls through circuit breakers',
      labelNames: ['breaker'],
    }),
    rejects: new Counter({
      name: 'circuit_breaker_rejects_total',
      help: 'Calls rejected by open circuit',
      labelNames: ['breaker'],
    }),
    timeouts: new Counter({
      name: 'circuit_breaker_timeouts_total',
      help: 'Timed-out calls through circuit breakers',
      labelNames: ['breaker'],
    }),
    fallbacks: new Counter({
      name: 'circuit_breaker_fallbacks_total',
      help: 'Fallback invocations',
      labelNames: ['breaker'],
    }),
    state: new Gauge({
      name: 'circuit_breaker_state',
      help: 'Current state: 0=closed, 1=halfOpen, 2=open',
      labelNames: ['breaker'],
    }),
  };

  return sharedMetrics;
}

export function createCircuitBreaker<TArgs extends unknown[], TReturn>(
  name: string,
  action: (...args: TArgs) => Promise<TReturn>,
  overrides?: Partial<CircuitBreakerOptions>,
): CircuitBreaker<TArgs, TReturn> {
  const options: CircuitBreakerOptions = { ...DEFAULT_OPTIONS, ...overrides, name };
  const breaker = new CircuitBreaker<TArgs, TReturn>(action, options);

  const m = getSharedMetrics();
  const labels = { breaker: name };

  breaker.on('fire', () => m.fires.inc(labels));
  breaker.on('success', () => m.successes.inc(labels));
  breaker.on('failure', () => m.failures.inc(labels));
  breaker.on('reject', () => m.rejects.inc(labels));
  breaker.on('timeout', () => m.timeouts.inc(labels));
  breaker.on('fallback', () => m.fallbacks.inc(labels));

  breaker.on('open', () => m.state.set(labels, STATE_MAP.open));
  breaker.on('halfOpen', () => m.state.set(labels, STATE_MAP.halfOpen));
  breaker.on('close', () => m.state.set(labels, STATE_MAP.closed));

  m.state.set(labels, STATE_MAP.closed);

  return breaker;
}
