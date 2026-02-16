import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req: any = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('Missing user');
    if (user.tid === '*' && (user.roles || []).includes('admin')) return true;

    const perms: string[] = user.perms || [];
    if (!perms.includes(required)) throw new ForbiddenException(`Missing permission: ${required}`);
    return true;
  }
}
