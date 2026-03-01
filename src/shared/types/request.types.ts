import type { FastifyRequest, FastifyReply } from 'fastify';

/** Request with correlation and tenant set by onRequest hook (main.ts) */
export interface AppFastifyRequest extends FastifyRequest {
  correlationId?: string;
  tenantId?: string;
  user?: JwtUserPayload;
}

/** JWT user payload attached by passport */
export interface JwtUserPayload {
  sub: string;
  tid?: string;
  roles?: string[];
  perms?: string[];
  plan?: string;
  region?: string;
}

export type { FastifyRequest, FastifyReply };
