import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PERMISSION_KEY } from './permissions.decorator';
import { AuditService } from '../audit/audit.service';

/** Ordem de planos (maior índice = tier mais alto). Usado para comparar plano do JWT com allowedPlans. */
const PLAN_TIER: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

@Injectable()
export class AbacGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
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

    const policy = await this.prisma.policy.findFirst({
      where: { permissionCode: required, enabled: true },
    });
    if (!policy) {
      await this.logDenied(req, required, 'no_policy', 'No policy for permission');
      throw new ForbiddenException('No policy for permission');
    }
    if (policy.effect.toUpperCase() !== 'ALLOW') {
      await this.logDenied(req, required, 'policy_deny', `Policy effect: ${policy.effect}`);
      throw new ForbiddenException('Policy denies');
    }

    const plan = (user.plan || 'free').trim().toLowerCase();
    const region = (user.region || 'region-a').trim().toLowerCase();

    const plans: string[] = this.parseJsonArray(policy.allowedPlans).map(p =>
      String(p).trim().toLowerCase(),
    );
    if (plans.length && !this.planAllowed(plan, plans)) {
      await this.logDenied(req, required, 'plan_not_allowed', `Plan '${plan}' not allowed`);
      throw new ForbiddenException(`Plan '${plan}' not allowed`);
    }
    const regions: string[] = this.parseJsonArray(policy.allowedRegions).map(r =>
      String(r).trim().toLowerCase(),
    );
    if (regions.length && !regions.includes(region)) {
      await this.logDenied(req, required, 'region_not_allowed', `Region '${region}' not allowed`);
      throw new ForbiddenException(`Region '${region}' not allowed`);
    }
    return true;
  }

  /**
   * allowedPlans define o conjunto de tiers permitidos; interpretamos o mínimo exigido como
   * min(tier) e permitimos qualquer tenant com tier >= esse mínimo (ex.: enterprise com política só ["pro"]).
   */
  private planAllowed(plan: string, allowed: string[]): boolean {
    if (allowed.includes(plan)) return true;
    const userTier = PLAN_TIER[plan];
    if (userTier === undefined) return false;
    const tiers = allowed.map(a => PLAN_TIER[a]).filter((t): t is number => t !== undefined);
    if (tiers.length === 0) return false;
    const minTier = Math.min(...tiers);
    return userTier >= minTier;
  }

  private parseJsonArray(value: string | string[] | null | undefined): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async logDenied(req: any, permission: string, reason: string, message: string): Promise<void> {
    await this.audit.log({
      tenantId: req.headers?.['x-tenant-id'] || undefined,
      actorSub: req.user?.sub || 'unknown',
      action: 'access_denied',
      target: `${req.method} ${req.url}`,
      detail: { guard: 'AbacGuard', permission, reason, message },
      correlationId: req.correlationId || '',
    });
  }
}
