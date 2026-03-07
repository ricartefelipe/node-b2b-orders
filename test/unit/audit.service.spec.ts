import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { AuditService } from '../../src/shared/audit/audit.service';

const mockPrisma = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditService(mockPrisma as unknown as PrismaService);
  });

  describe('log', () => {
    it('should create an audit entry', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'a1' });
      await service.log({
        tenantId: 't1',
        actorSub: 'u1',
        action: 'order.created',
        target: 'POST /orders',
        detail: { orderId: 'o1' },
        correlationId: 'corr-1',
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 't1',
          actorSub: 'u1',
          action: 'order.created',
          target: 'POST /orders',
          detail: { orderId: 'o1' },
          correlationId: 'corr-1',
        },
      });
    });

    it('should set tenantId to null when not provided', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'a2' });
      await service.log({
        actorSub: 'u1',
        action: 'access_denied',
        target: 'GET /orders',
        detail: {},
        correlationId: '',
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: null }),
      });
    });

    it('should not throw when prisma fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockPrisma.auditLog.create.mockRejectedValue(new Error('DB down'));
      await expect(
        service.log({
          actorSub: 'u1',
          action: 'test',
          target: 'GET /',
          detail: {},
          correlationId: '',
        }),
      ).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('query', () => {
    it('should return filtered results by tenantId', async () => {
      const rows = [{ id: 'a1', action: 'order.created' }];
      mockPrisma.auditLog.findMany.mockResolvedValue(rows);
      const result = await service.query('t1', {});
      expect(result).toEqual(rows);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { tenantId: 't1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('should apply action filter', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      await service.query('t1', { action: 'access_denied' });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', action: 'access_denied' },
        }),
      );
    });

    it('should apply target filter', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      await service.query('t1', { target: 'POST /orders' });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', target: 'POST /orders' },
        }),
      );
    });

    it('should apply date range filters', async () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-12-31');
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      await service.query('t1', { startDate: start, endDate: end });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 't1',
            createdAt: { gte: start, lte: end },
          },
        }),
      );
    });

    it('should apply only startDate when endDate is absent', async () => {
      const start = new Date('2025-06-01');
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      await service.query('t1', { startDate: start });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 't1',
            createdAt: { gte: start },
          },
        }),
      );
    });

    it('should respect custom limit and offset', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      await service.query('t1', { limit: 10, offset: 20 });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });
  });
});
