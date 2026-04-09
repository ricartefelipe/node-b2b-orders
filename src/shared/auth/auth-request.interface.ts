import { FastifyRequest } from 'fastify';

export interface JwtPayload {
  sub: string;
  tid: string;
  plan?: string;
  region?: string;
  roles?: string[];
  perms?: string[];
}

export interface DecoratedFastifyRequest extends FastifyRequest {
  correlationId?: string;
  tenantId?: string;
}

export interface AuthRequest extends DecoratedFastifyRequest {
  user: JwtPayload;
}
