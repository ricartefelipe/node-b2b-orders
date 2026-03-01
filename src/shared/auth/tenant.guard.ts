import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AppFastifyRequest } from '../types/request.types';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppFastifyRequest>();
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) throw new ForbiddenException('Missing X-Tenant-Id');

    const user = req.user;
    if (!user) throw new ForbiddenException('Missing user');

    if (user.tid !== '*' && user.tid !== tenantId) throw new ForbiddenException('Tenant mismatch');
    return true;
  }
}
