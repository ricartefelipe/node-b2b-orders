declare module 'opossum' {
  import { EventEmitter } from 'events';

  interface CircuitBreakerOptions {
    timeout?: number | false;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    rollingCountTimeout?: number;
    rollingCountBuckets?: number;
    name?: string;
    rollingPercentilesEnabled?: boolean;
    capacity?: number;
    volumeThreshold?: number;
    errorFilter?: (err: Error) => boolean;
    cache?: boolean;
  }

  interface CircuitBreakerStats {
    fires: number;
    timeouts: number;
    successes: number;
    failures: number;
    rejects: number;
    fallbacks: number;
    latencyMean: number;
    cacheHits: number;
    cacheMisses: number;
  }

  type CircuitBreakerState = 'open' | 'halfOpen' | 'closed';

  class CircuitBreaker<TArgs extends unknown[] = unknown[], TReturn = unknown> extends EventEmitter {
    constructor(action: (...args: TArgs) => Promise<TReturn>, options?: CircuitBreakerOptions);

    readonly name: string;
    readonly opened: boolean;
    readonly closed: boolean;
    readonly halfOpen: boolean;
    readonly status: { stats: CircuitBreakerStats };
    readonly enabled: boolean;

    fire(...args: TArgs): Promise<TReturn>;
    fallback(fn: (...args: TArgs) => TReturn | Promise<TReturn>): this;
    enable(): void;
    disable(): void;
    open(): void;
    close(): void;
    shutdown(): void;
  }

  export default CircuitBreaker;
  export { CircuitBreakerOptions, CircuitBreakerStats, CircuitBreakerState };
}
