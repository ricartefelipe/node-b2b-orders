import { Controller, Get, Logger, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { EventsService, MessageEvent } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@Controller('events')
@UseGuards(JwtAuthGuard, TenantGuard)
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}

  @Sse('stream')
  stream(@Req() req: any): Observable<MessageEvent> {
    const tenantId: string = req.headers['x-tenant-id'];
    const clientId = randomUUID();

    this.logger.log(`SSE stream requested by tenant=${tenantId}, clientId=${clientId}`);

    const observable = this.eventsService.addClient(clientId, tenantId);

    req.raw.on('close', () => {
      this.eventsService.removeClient(clientId);
    });

    return observable;
  }

  @Get('clients')
  getClientCount(@Req() req: any) {
    const tenantId: string = req.headers['x-tenant-id'];
    return { tenantId, activeClients: this.eventsService.getActiveClients(tenantId) };
  }
}
