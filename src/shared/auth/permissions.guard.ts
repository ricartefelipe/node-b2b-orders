import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './permissions.decorator';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req: any = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      await this.logDenied(req, required, 'missing_user', 'Missing user');
      throw new ForbiddenException('Missing user');
    }
    if (user.tid === '*' && (user.roles || []).includes('admin')) return true;

    const perms: string[] = user.perms || [];
    if (!perms.includes(required)) {
      await this.logDenied(req, required, 'missing_permission', `Missing permission: ${required}`);
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }

  private async logDenied(req: any, permission: string, reason: string, message: string): Promise<void> {
    await this.audit.log({
      tenantId: req.headers?.['x-tenant-id'] || undefined,
      actorSub: req.user?.sub || 'unknown',
      action: 'access_denied',
      target: `${req.method} ${req.url}`,
      detail: { guard: 'PermissionsGuard', permission, reason, message },
      correlationId: req.correlationId || '',
    });
  }
}
