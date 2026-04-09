import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthRequest } from './auth-request.interface';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly audit: AuditService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) {
      await this.logDenied(req, 'missing_tenant_id', 'Missing X-Tenant-Id');
      throw new ForbiddenException('Missing X-Tenant-Id');
    }

    const user = req.user;
    if (!user) {
      await this.logDenied(req, 'missing_user', 'Missing user');
      throw new ForbiddenException('Missing user');
    }

    if (user.tid !== '*' && user.tid !== tenantId) {
      await this.logDenied(req, 'tenant_mismatch', `Token tid=${user.tid} vs header=${tenantId}`);
      throw new ForbiddenException('Tenant mismatch');
    }
    return true;
  }

  private async logDenied(req: AuthRequest, reason: string, message: string): Promise<void> {
    await this.audit.log({
      tenantId: req.tenantId || undefined,
      actorSub: req.user?.sub || 'unknown',
      action: 'access_denied',
      target: `${req.method} ${req.url}`,
      detail: { guard: 'TenantGuard', reason, message },
      correlationId: req.correlationId || '',
    });
  }
}
