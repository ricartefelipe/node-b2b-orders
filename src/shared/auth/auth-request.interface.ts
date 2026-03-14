import { FastifyRequest } from 'fastify';

export interface JwtPayload {
  sub: string;
  tid: string;
  plan?: string;
  region?: string;
  roles?: string[];
  perms?: string[];
}

export interface AuthRequest extends FastifyRequest {
  user: JwtPayload;
  correlationId?: string;
  tenantId?: string;
}
