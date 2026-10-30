import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import {
  IDEMPOTENCY_SCOPE,
  fingerprintOf,
  isIdempotencyRecordConflict,
  isIdempotentEntry,
} from '../../src/shared/idempotency/idempotency';
import { IdempotencyService } from '../../src/shared/idempotency/idempotency.service';

const mockPrisma = { idempotencyRecord: { findUnique: jest.fn() } };
const mockRedis = { idemGet: jest.fn(), idemSet: jest.fn() };

function uniqueViolation(target: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('fingerprintOf', () => {
  it('is stable for the same version and lines', () => {
    expect(fingerprintOf('v1', ['a', 'b'])).toBe(fingerprintOf('v1', ['a', 'b']));
  });

  it('changes with the content, the order and the version', () => {
    const base = fingerprintOf('v1', ['a', 'b']);
    expect(fingerprintOf('v1', ['a', 'c'])).not.toBe(base);
    expect(fingerprintOf('v1', ['b', 'a'])).not.toBe(base);
    expect(fingerprintOf('v2', ['a', 'b'])).not.toBe(base);
  });
});

describe('isIdempotentEntry', () => {
  it('accepts only entries that carry a fingerprint and a response', () => {
    expect(isIdempotentEntry({ fingerprint: 'f', response: {} })).toBe(true);
    expect(isIdempotentEntry({ response: {} })).toBe(false);
    expect(isIdempotentEntry({ id: 'legacy-adjustment' })).toBe(false);
    expect(isIdempotentEntry(null)).toBe(false);
  });
});

describe('isIdempotencyRecordConflict', () => {
  it('recognises only the unique violation of (tenant, scope, key)', () => {
    expect(isIdempotencyRecordConflict(uniqueViolation(['tenant_id', 'scope', 'key']))).toBe(true);
    expect(isIdempotencyRecordConflict(uniqueViolation('idempotency_records_tenant_id_scope_key_key'))).toBe(true);
  });

  it('does not treat other database errors as a conflict', () => {
    expect(isIdempotencyRecordConflict(uniqueViolation(['tenant_id', 'sku']))).toBe(false);
    expect(
      isIdempotencyRecordConflict(
        new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test', meta: { target: ['key'] } }),
      ),
    ).toBe(false);
    expect(isIdempotencyRecordConflict(new Error('connection reset'))).toBe(false);
  });
});

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IdempotencyService(mockPrisma as unknown as PrismaService, mockRedis as unknown as RedisService);
  });

  it('serves the cached entry when it carries a fingerprint', async () => {
    mockRedis.idemGet.mockResolvedValue({ fingerprint: 'f', response: { id: '1' } });
    const entry = await service.find('t1', IDEMPOTENCY_SCOPE.createOrder, 'k');
    expect(entry).toEqual({ fingerprint: 'f', response: { id: '1' } });
    expect(mockPrisma.idempotencyRecord.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to the durable record when the cache was lost', async () => {
    mockRedis.idemGet.mockResolvedValue(null);
    mockPrisma.idempotencyRecord.findUnique.mockResolvedValue({ fingerprint: 'f', response: { id: '1' } });
    const entry = await service.find('t1', IDEMPOTENCY_SCOPE.createOrder, 'k');
    expect(entry).toEqual({ fingerprint: 'f', response: { id: '1' } });
    expect(mockPrisma.idempotencyRecord.findUnique).toHaveBeenCalledWith({
      where: { tenantId_scope_key: { tenantId: 't1', scope: 'create-order', key: 'k' } },
    });
  });

  it('recovers a legacy cache entry from the persisted effect instead of trusting it', async () => {
    mockRedis.idemGet.mockResolvedValue({ id: 'legacy' });
    mockPrisma.idempotencyRecord.findUnique.mockResolvedValue(null);
    const recover = jest.fn().mockResolvedValue({ fingerprint: 'from-db', response: { id: 'legacy' } });
    const entry = await service.find('t1', IDEMPOTENCY_SCOPE.inventoryAdjustment, 'k', recover);
    expect(recover).toHaveBeenCalledWith({ id: 'legacy' });
    expect(entry?.fingerprint).toBe('from-db');
  });

  it('returns null when nothing is known about the key', async () => {
    mockRedis.idemGet.mockResolvedValue(null);
    mockPrisma.idempotencyRecord.findUnique.mockResolvedValue(null);
    expect(await service.find('t1', IDEMPOTENCY_SCOPE.createOrder, 'k')).toBeNull();
  });

  it('replays the same payload and conflicts on a different one', () => {
    const entry = { fingerprint: 'f', response: { id: '1' } };
    expect(service.replay(entry, 'f')).toEqual({ id: '1' });
    expect(() => service.replay(entry, 'other')).toThrow(ConflictException);
  });

  it('keeps the effect when the cache write fails', async () => {
    mockRedis.idemSet.mockRejectedValue(new Error('redis down'));
    await expect(service.cache('t1', IDEMPOTENCY_SCOPE.createOrder, 'k', { fingerprint: 'f', response: {} })).resolves.toBeUndefined();
  });
});
