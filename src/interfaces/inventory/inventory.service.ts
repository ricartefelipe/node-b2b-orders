import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryAdjustment, InventoryItem, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../shared/audit/audit.service';
import { IDEMPOTENCY_SCOPE, IdempotentEntry, fingerprintOf, isIdempotencyRecordConflict } from '../../shared/idempotency/idempotency';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { BusinessMetricsService } from '../../shared/metrics/business-metrics.service';
import {
  PaginatedResponse,
  decodeCursor,
  encodeCursor,
  resolveLimit,
} from '../../shared/pagination/cursor';
import { resolveInventorySort } from '../../shared/sorting/sort-query.dto';
import { AdjustmentType } from './dto';

const ADJUSTMENT_FINGERPRINT_VERSION = 'v1';

/** Impressão digital canônica do ajuste: só os campos que definem a operação. */
export function adjustmentFingerprint(sku: string, type: AdjustmentType, qty: number, reason: string): string {
  return fingerprintOf(ADJUSTMENT_FINGERPRINT_VERSION, [sku, type, String(qty), reason]);
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly metrics: BusinessMetricsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    tenantId: string,
    sku?: string,
    cursor?: string,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    rawLimit?: number,
  ): Promise<PaginatedResponse<InventoryItem>> {
    const limit = resolveLimit(rawLimit);
    const where: Prisma.InventoryItemWhereInput = { tenantId };
    if (sku) where.sku = sku;

    const findArgs: Prisma.InventoryItemFindManyArgs = {
      where,
      orderBy: resolveInventorySort(sortBy, sortOrder),
      take: limit + 1,
    };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        findArgs.cursor = { id: decoded.id };
        findArgs.skip = 1;
      }
    }

    const rows = await this.prisma.inventoryItem.findMany(findArgs);
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
    const scope = IDEMPOTENCY_SCOPE.inventoryAdjustment;
    const fingerprint = adjustmentFingerprint(sku, type, qty, reason);
    if (idempotencyKey) {
      const prior = await this.idempotency.find(tenantId, scope, idempotencyKey, (cached) =>
        this.recoverLegacyAdjustment(tenantId, cached),
      );
      if (prior) return this.idempotency.replay<InventoryAdjustment>(prior, fingerprint);
    }

    let entry: IdempotentEntry<InventoryAdjustment>;
    try {
      entry = await this.prisma.$transaction(async (tx) => {
        const adjustment = await this.applyAdjustment(tx, tenantId, correlationId, actorSub, idempotencyKey, sku, type, qty, reason);
        const created = { fingerprint, response: adjustment };
        if (idempotencyKey) {
          // Mesma transação do efeito: o estoque só muda junto com o registro da chave.
          await this.idempotency.record(tx, tenantId, scope, idempotencyKey, created);
        }
        return created;
      });
    } catch (error) {
      if (!idempotencyKey || !isIdempotencyRecordConflict(error)) throw error;
      const winner = await this.idempotency.findDurable(tenantId, scope, idempotencyKey);
      if (!winner) throw error;
      return this.idempotency.replay<InventoryAdjustment>(winner, fingerprint);
    }

    const result = entry.response;
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
      await this.idempotency.cache(tenantId, scope, idempotencyKey, entry);
    }

    return result;
  }

  /** Efeito de negócio do ajuste, dentro da transação recebida. */
  private async applyAdjustment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    correlationId: string,
    actorSub: string,
    idempotencyKey: string | undefined,
    sku: string,
    type: AdjustmentType,
    qty: number,
    reason: string,
  ): Promise<InventoryAdjustment> {
    const existing = await tx.inventoryItem.findUnique({ where: { tenantId_sku: { tenantId, sku } } });
    if (!existing && type === AdjustmentType.OUT) {
      throw new NotFoundException(`SKU ${sku} not found for tenant`);
    }
    // Criação tolerante à corrida: INSERT ... ON CONFLICT DO NOTHING (createMany com skipDuplicates é
    // nativo no Postgres); duas requisições simultâneas para um SKU novo não disputam o INSERT.
    if (!existing) {
      await tx.inventoryItem.createMany({
        data: [{ tenantId, sku, availableQty: 0, reservedQty: 0 }],
        skipDuplicates: true,
      });
    }
    const inv = existing ?? (await tx.inventoryItem.findUniqueOrThrow({ where: { tenantId_sku: { tenantId, sku } } }));

    // Movimentos relativos são aplicados pelo banco (increment/decrement), nunca por leitura + escrita:
    // ajustes concorrentes com chaves diferentes não perdem atualização.
    switch (type) {
      case AdjustmentType.IN:
        await tx.inventoryItem.update({
          where: { tenantId_sku: { tenantId, sku } },
          data: { availableQty: { increment: qty } },
        });
        break;
      case AdjustmentType.OUT: {
        const debited = await tx.inventoryItem.updateMany({
          where: { tenantId, sku, availableQty: { gte: qty } },
          data: { availableQty: { decrement: qty } },
        });
        if (debited.count === 0) {
          throw new ConflictException(
            `Insufficient available qty (${inv.availableQty}) for OUT of ${qty}`
          );
        }
        break;
      }
      case AdjustmentType.ADJUSTMENT:
        await tx.inventoryItem.update({
          where: { tenantId_sku: { tenantId, sku } },
          data: { availableQty: qty },
        });
        break;
      default: {
        const _exhaustive: never = type;
        throw new BadRequestException(`Unknown adjustment type: ${_exhaustive}`);
      }
    }

    return tx.inventoryAdjustment.create({
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
  }

  /**
   * Entradas do Redis anteriores ao registro durável guardavam o ajuste sem impressão digital:
   * ela é recalculada a partir do ajuste persistido, nunca inventada.
   */
  private async recoverLegacyAdjustment(tenantId: string, cached: unknown): Promise<IdempotentEntry | null> {
    const legacyId = (cached as { id?: string } | null)?.id;
    if (!legacyId) return null;
    const adjustment = await this.prisma.inventoryAdjustment.findFirst({ where: { id: legacyId, tenantId } });
    if (!adjustment) return null;
    const fingerprint = adjustmentFingerprint(adjustment.sku, adjustment.type as AdjustmentType, adjustment.qty, adjustment.reason);
    return { fingerprint, response: adjustment };
  }

  async listAdjustments(
    tenantId: string,
    sku?: string,
    cursor?: string,
    rawLimit?: number,
  ): Promise<PaginatedResponse<InventoryAdjustment>> {
    const limit = resolveLimit(rawLimit);
    const where: Prisma.InventoryAdjustmentWhereInput = { tenantId };
    if (sku) where.sku = sku;

    const findArgs: Prisma.InventoryAdjustmentFindManyArgs = {
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

    const rows = await this.prisma.inventoryAdjustment.findMany(findArgs);
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.id, last.createdAt) : null;

    return { data, nextCursor, hasMore };
  }
}
