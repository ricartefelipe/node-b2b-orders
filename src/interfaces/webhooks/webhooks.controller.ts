import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { Permission } from '../../shared/auth/permissions.decorator';

import { CreateWebhookDto } from './dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@Controller('v1/webhooks')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  @Permission('webhooks:write')
  async register(@Req() req: any, @Body() body: CreateWebhookDto) {
    const tenantId = req.headers['x-tenant-id'];
    return this.webhooks.registerEndpoint(tenantId, body.url, body.events, body.secret);
  }

  @Get()
  @Permission('webhooks:read')
  async list(@Req() req: any) {
    const tenantId = req.headers['x-tenant-id'];
    return this.webhooks.listEndpoints(tenantId);
  }

  @Delete(':id')
  @Permission('webhooks:write')
  async remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const tenantId = req.headers['x-tenant-id'];
    await this.webhooks.deleteEndpoint(id, tenantId);
    return { deleted: true };
  }

  @Get(':id/deliveries')
  @Permission('webhooks:read')
  async deliveries(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const tenantId = req.headers['x-tenant-id'];
    return this.webhooks.listDeliveries(id, tenantId);
  }
}
