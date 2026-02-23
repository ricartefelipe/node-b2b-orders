import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuditService } from '../../shared/audit/audit.service';
import { BusinessMetricsService } from '../../shared/metrics/business-metrics.service';
import { AdjustmentType } from './dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly metrics: BusinessMetricsService
  ) {}

  async list(tenantId: string, sku?: string) {
    return this.prisma.inventoryItem.findMany({
      where: { tenantId, ...(sku ? { sku } : {}) },
      orderBy: { sku: 'asc' },
      take: 200,
    });
  }

  async createAdjustment(
    tenantId: string,
    correlationId: string,
    actorSub: string,
    idempotencyKey: string | undefined,
    sku: string,
    type: AdjustmentType,
    qty: number,
    reason: string
  ) {
    if (idempotencyKey) {
      const idemKey = `idem:${tenantId}:inv-adj:${idempotencyKey}`;
      const hit = await this.redis.idemGet(idemKey);
      if (hit) return hit;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let inv = await tx.inventoryItem.findUnique({
        where: { tenantId_sku: { tenantId, sku } },
      });

      if (!inv) {
        if (type === AdjustmentType.OUT) {
          throw new NotFoundException(`SKU ${sku} not found for tenant`);
        }
        inv = await tx.inventoryItem.create({
          data: { tenantId, sku, availableQty: 0, reservedQty: 0 },
        });
      }

      let newAvailable = inv.availableQty;
      switch (type) {
        case AdjustmentType.IN:
          newAvailable += qty;
          break;
        case AdjustmentType.OUT:
          if (inv.availableQty < qty) {
            throw new ConflictException(
              `Insufficient available qty (${inv.availableQty}) for OUT of ${qty}`
            );
          }
          newAvailable -= qty;
          break;
        case AdjustmentType.ADJUSTMENT:
          newAvailable = qty;
          break;
        default: {
          const _exhaustive: never = type;
          throw new BadRequestException(`Unknown adjustment type: ${_exhaustive}`);
        }
      }

      await tx.inventoryItem.update({
        where: { tenantId_sku: { tenantId, sku } },
        data: { availableQty: newAvailable },
      });

      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          tenantId,
          sku,
          type,
          qty,
          reason,
          actorSub,
          correlationId,
          idempotencyKey: idempotencyKey || null,
        },
      });

      return adjustment;
    });

    this.metrics.inventoryAdjusted.inc({ tenant_id: tenantId, type });

    await this.audit.log({
      tenantId,
      actorSub,
      action: 'inventory.adjustment',
      target: `InventoryItem:${tenantId}:${sku}`,
      detail: { adjustmentId: result.id, type, qty, reason },
      correlationId,
    });

    if (idempotencyKey) {
      const idemKey = `idem:${tenantId}:inv-adj:${idempotencyKey}`;
      await this.redis.idemSet(idemKey, result, 24 * 3600);
    }

    return result;
  }

  async listAdjustments(tenantId: string, sku?: string, limit?: number, offset?: number) {
    const where: Record<string, unknown> = { tenantId };
    if (sku) where.sku = sku;

    return this.prisma.inventoryAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit || 50,
      skip: offset || 0,
    });
  }
}
