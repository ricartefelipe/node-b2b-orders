import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { IdempotencyScope, IdempotentEntry, isIdempotentEntry } from './idempotency';

const CACHE_TTL_SECONDS = 24 * 3600;

/** Reconstrói impressão digital e resposta a partir do efeito já persistido (entradas legadas). */
export type LegacyRecovery = (cached: unknown) => Promise<IdempotentEntry | null>;

/**
 * Idempotência durável: o registro (tenant, escopo, chave, impressão digital, resposta) é gravado
 * na mesma transação do efeito de negócio, por isso sobrevive à perda do Redis e a uma queda
 * entre o commit e a resposta. O Redis guarda só uma cópia para leitura rápida.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Procura um registro anterior: cache, depois banco e, por fim, a recuperação legada
   * (entradas do Redis gravadas antes do registro durável existir).
   */
  async find(
    tenantId: string,
    scope: IdempotencyScope,
    key: string,
    recoverLegacy?: LegacyRecovery,
  ): Promise<IdempotentEntry | null> {
    const cached = await this.redis.idemGet(this.cacheKey(tenantId, scope, key));
    if (isIdempotentEntry(cached)) return cached;

    const durable = await this.findDurable(tenantId, scope, key);
    if (durable) return durable;

    if (cached !== null && recoverLegacy) return recoverLegacy(cached);
    return null;
  }

  async findDurable(tenantId: string, scope: IdempotencyScope, key: string): Promise<IdempotentEntry | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: { tenantId_scope_key: { tenantId, scope, key } },
    });
    return record ? { fingerprint: record.fingerprint, response: record.response } : null;
  }

  /** Grava o registro dentro da transação do efeito. */
  async record(
    tx: Prisma.TransactionClient,
    tenantId: string,
    scope: IdempotencyScope,
    key: string,
    entry: IdempotentEntry,
  ): Promise<void> {
    await tx.idempotencyRecord.create({
      data: {
        tenantId,
        scope,
        key,
        fingerprint: entry.fingerprint,
        response: entry.response as Prisma.InputJsonValue,
      },
    });
  }

  /** Cópia de leitura rápida; falha aqui não desfaz o efeito já persistido. */
  async cache(tenantId: string, scope: IdempotencyScope, key: string, entry: IdempotentEntry): Promise<void> {
    try {
      await this.redis.idemSet(this.cacheKey(tenantId, scope, key), entry, CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`idempotency cache write failed for ${scope}:${key}: ${(error as Error).message}`);
    }
  }

  /** Repetição válida devolve a resposta original; conteúdo diferente é conflito, sem novo efeito. */
  replay<TResponse>(entry: IdempotentEntry, fingerprint: string): TResponse {
    if (entry.fingerprint !== fingerprint) {
      throw new ConflictException('Idempotency-Key already used with a different payload');
    }
    return entry.response as TResponse;
  }

  private cacheKey(tenantId: string, scope: IdempotencyScope, key: string): string {
    return `idem:${tenantId}:${scope}:${key}`;
  }
}
