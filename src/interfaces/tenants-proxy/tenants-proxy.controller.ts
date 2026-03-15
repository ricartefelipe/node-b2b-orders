import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantsProxyService } from './tenants-proxy.service';

/**
 * Proxy para /v1/tenants — encaminha ao Spring Core.
 * Útil quando o Admin Console aponta CORE_API_BASE_URL para o Node (BFF).
 * Requer CORE_API_URL no ambiente.
 */
@ApiExcludeController()
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsProxyController {
  constructor(private readonly proxy: TenantsProxyService) {}

  @All()
  async proxyRoot(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy.forward(req, reply, '');
  }

  @All('*')
  async proxyWildcard(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const path = (req.url || '').split('?')[0].replace(/^\/v1\/tenants\/?/, '') || '';
    return this.proxy.forward(req, reply, path);
  }
}
