import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

export type RateLimitDecision = { allowed: boolean; remaining: number; retryAfterSeconds: number; limit: number };
export type ChaosConfig = { enabled: boolean; failPercent: number; latencyMs: number };

const LUA_TOKEN_BUCKET = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])

if tokens == nil then tokens = capacity end
if ts == nil then ts = now end

local delta = math.max(0, now - ts)
local refill = delta * refill_rate
tokens = math.min(capacity, tokens + refill)

local allowed = 0
if tokens >= requested then
  allowed = 1
  tokens = tokens - requested
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
local ttl = math.ceil(capacity / refill_rate)
redis.call('EXPIRE', key, ttl)

return {allowed, tokens, ttl}
`;

@Injectable()
export class RedisService {
  private readonly client: Redis;
  private tokenBucketSha: string | null = null;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true });
  }

  get raw() {
    return this.client;
  }

  static tryDecodeSubFromAuthHeader(auth?: string): string | null {
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.substring('Bearer '.length).trim();
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      const payload = JSON.parse(Buffer.from(base64UrlToBase64(parts[1]), 'base64').toString('utf8'));
      return payload.sub || null;
    } catch {
      return null;
    }
  }

  tryDecodeSubFromAuthHeader(auth?: string): string | null {
    return RedisService.tryDecodeSubFromAuthHeader(auth);
  }

  async consumeRateLimit(tenantId: string, sub: string, group: 'read' | 'write'): Promise<RateLimitDecision> {
    const writeLimit = Number(process.env.RATE_LIMIT_WRITE_PER_MIN || 60);
    const readLimit = Number(process.env.RATE_LIMIT_READ_PER_MIN || 240);
    const limit = group === 'write' ? writeLimit : readLimit;
    const capacity = limit;
    const refillRate = capacity / 60.0;
    const now = Date.now() / 1000.0;
    const key = `ratelimit:${tenantId}:${sub}:${group}`;

    if (!this.tokenBucketSha) this.tokenBucketSha = await this.client.script('LOAD', LUA_TOKEN_BUCKET);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await this.client.evalsha(this.tokenBucketSha, 1, key, capacity, refillRate, now, 1);
    const allowed = Number(res[0]) === 1;
    const tokens = Math.floor(Number(res[1]));
    const ttl = Number(res[2]);
    return { allowed, remaining: Math.max(0, tokens), retryAfterSeconds: allowed ? 0 : 1, limit };
  }

  async getChaosConfig(tenantId: string): Promise<ChaosConfig> {
    const envEnabled = (process.env.CHAOS_ENABLED || 'false').toLowerCase() === 'true';
    const envFail = Number(process.env.CHAOS_FAIL_PERCENT || 0);
    const envLatency = Number(process.env.CHAOS_LATENCY_MS || 0);
    const base: ChaosConfig = { enabled: envEnabled, failPercent: envFail, latencyMs: envLatency };

    try {
      const raw = await this.client.get(`chaos:${tenantId}`);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled ?? base.enabled,
        failPercent: parsed.failPercent ?? base.failPercent,
        latencyMs: parsed.latencyMs ?? base.latencyMs,
      };
    } catch {
      return base;
    }
  }

  async setChaosConfig(tenantId: string, cfg: ChaosConfig): Promise<void> {
    await this.client.set(`chaos:${tenantId}`, JSON.stringify(cfg));
  }

  async idemGet(key: string): Promise<any | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async idemSet(key: string, value: any, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
}

function base64UrlToBase64(input: string): string {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  return s;
}
