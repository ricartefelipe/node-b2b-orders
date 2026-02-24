import { Injectable } from '@nestjs/common';
import CircuitBreaker, { CircuitBreakerOptions } from 'opossum';

import { createCircuitBreaker } from './circuit-breaker.factory';

@Injectable()
export class CircuitBreakerService {
  private readonly breakers = new Map<string, CircuitBreaker>();

  create<TArgs extends unknown[], TReturn>(
    name: string,
    action: (...args: TArgs) => Promise<TReturn>,
    overrides?: Partial<CircuitBreakerOptions>,
  ): CircuitBreaker<TArgs, TReturn> {
    const existing = this.breakers.get(name);
    if (existing) return existing as CircuitBreaker<TArgs, TReturn>;

    const breaker = createCircuitBreaker(name, action, overrides);
    this.breakers.set(name, breaker as CircuitBreaker);
    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  shutdownAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.shutdown();
    }
    this.breakers.clear();
  }
}
