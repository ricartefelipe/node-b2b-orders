import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuditService } from '../../shared/audit/audit.service';
import { BusinessMetricsService } from '../../shared/metrics/business-metrics.service';
import {
  PaginatedResponse,
  decodeCursor,
  encodeCursor,
  resolveLimit,
} from '../../shared/pagination/cursor';
import { AdjustmentType } from './dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly metrics: BusinessMetricsService
  ) {}

  async list(
    tenantId: string,
    sku?: string,
    cursor?: string,
    rawLimit?: number,
  ): Promise<PaginatedResponse<{ id: string; sku: string; tenantId: string; availableQty: number; reservedQty: number; createdAt: Date }>> {
    const limit = resolveLimit(rawLimit);
    const where: Record<string, unknown> = { tenantId };
    if (sku) where.sku = sku;

    const findArgs: Record<string, unknown> = {
      where,
      orderBy: { sku: 'asc' as const },
      take: limit + 1,
    };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        findArgs.cursor = { id: decoded.id };
        findArgs.skip = 1;
      }
    }

    const rows = await this.prisma.inventoryItem.findMany(findArgs as Prisma.InventoryItemFindManyArgs);
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor(last.id, new Date())
      : null;

    return { data, nextCursor, hasMore };
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

  async listAdjustments(
    tenantId: string,
    sku?: string,
    cursor?: string,
    rawLimit?: number,
  ): Promise<PaginatedResponse<unknown>> {
    const limit = resolveLimit(rawLimit);
    const where: Record<string, unknown> = { tenantId };
    if (sku) where.sku = sku;

    const findArgs: Record<string, unknown> = {
      where,
      orderBy: { createdAt: 'desc' as const },
      take: limit + 1,
    };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        findArgs.cursor = { id: decoded.id };
        findArgs.skip = 1;
      }
    }

    const rows = await this.prisma.inventoryAdjustment.findMany(findArgs as Prisma.InventoryAdjustmentFindManyArgs);
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.id, last.createdAt) : null;

    return { data, nextCursor, hasMore };
  }
}
