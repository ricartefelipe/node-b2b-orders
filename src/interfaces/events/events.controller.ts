import { Controller, Get, Logger, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { AuthRequest } from '../../shared/auth/auth-request.interface';
import { EventsService, MessageEvent } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@Controller('events')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}

  @Sse('stream')
  @Permission('orders:read')
  stream(@Req() req: AuthRequest): Observable<MessageEvent> {
    const tenantId = req.headers['x-tenant-id'] as string;
    const clientId = randomUUID();

    this.logger.log(`SSE stream requested by tenant=${tenantId}, clientId=${clientId}`);

    const observable = this.eventsService.addClient(clientId, tenantId);

    req.raw.on('close', () => {
      this.eventsService.removeClient(clientId);
    });

    return observable;
  }

  @Get('clients')
  @Permission('orders:read')
  getClientCount(@Req() req: AuthRequest) {
    const tenantId = req.headers['x-tenant-id'] as string;
    return { tenantId, activeClients: this.eventsService.getActiveClients(tenantId) };
  }
}
