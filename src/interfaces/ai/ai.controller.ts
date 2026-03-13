import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';

import { AiDocsService } from './ai-docs.service';

@ApiTags('ai')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID para distributed tracing' })
@Controller('ai')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class AiController {
  constructor(private readonly aiDocs: AiDocsService) {}

  @Get('docs')
  @Permission('analytics:read')
  async getDocs(@Req() req: any) {
    const tenantId = req.headers['x-tenant-id'];
    return this.aiDocs.getStructuredDocs(tenantId);
  }
}
