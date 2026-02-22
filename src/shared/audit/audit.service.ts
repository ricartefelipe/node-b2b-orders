import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface AuditEntry {
  tenantId?: string;
  actorSub: string;
  action: string;
  target: string;
  detail: object;
  correlationId: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId || null,
          actorSub: entry.actorSub,
          action: entry.action,
          target: entry.target,
          detail: entry.detail as any,
          correlationId: entry.correlationId,
        },
      });
    } catch (err) {
      console.error('AuditService.log failed', err);
    }
  }

  async query(tenantId: string, opts: { action?: string; target?: string; limit?: number; offset?: number }) {
    const where: Record<string, unknown> = { tenantId };
    if (opts.action) where.action = opts.action;
    if (opts.target) where.target = opts.target;

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit || 50,
      skip: opts.offset || 0,
    });
  }
}
