import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { AuditService } from '../../shared/audit/audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('audit')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Permission('audit:read')
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async list(
    @Req() req: any,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantId = req.headers['x-tenant-id'];
    return this.audit.query(tenantId, {
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('export')
  @Permission('audit:read')
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO 8601 date' })
  async export(
    @Req() req: any,
    @Res() reply: any,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.headers['x-tenant-id'];
    const rows = await this.audit.query(tenantId, {
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: 10_000,
      offset: 0,
    });

    reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="audit-${tenantId}-${Date.now()}.json"`)
      .send(JSON.stringify(rows, null, 2));
  }
}
