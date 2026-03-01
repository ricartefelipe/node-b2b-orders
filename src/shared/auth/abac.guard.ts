import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PERMISSION_KEY } from './permissions.decorator';
import type { AppFastifyRequest } from '../types/request.types';

@Injectable()
export class AbacGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<AppFastifyRequest>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Missing user');
    if (user.tid === '*' && (user.roles || []).includes('admin')) return true;

    const policy = await this.prisma.policy.findUnique({ where: { permissionCode: required } });
    if (!policy) throw new ForbiddenException('No policy for permission');
    if (policy.effect !== 'allow') throw new ForbiddenException('Policy denies');

    const plan = user.plan || 'free';
    const region = user.region || 'region-a';

    if (policy.allowedPlans?.length && !policy.allowedPlans.includes(plan)) {
      throw new ForbiddenException(`Plan '${plan}' not allowed`);
    }
    if (policy.allowedRegions?.length && !policy.allowedRegions.includes(region)) {
      throw new ForbiddenException(`Region '${region}' not allowed`);
    }
    return true;
  }
}
