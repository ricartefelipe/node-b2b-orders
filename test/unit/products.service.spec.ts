import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { ProductsService } from '../../src/interfaces/products/products.service';

const mockPrisma = {
  product: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService(mockPrisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('should create a product with default values', async () => {
      const expected = {
        id: 'p1',
        tenantId: 't1',
        name: 'Widget',
        sku: 'WDG-001',
        price: 19.99,
        description: '',
        category: '',
        imageUrl: '',
        currency: 'BRL',
        active: true,
      };
      mockPrisma.product.create.mockResolvedValue(expected);

      const result = await service.create('t1', { name: 'Widget', sku: 'WDG-001', price: 19.99 });

      expect(result).toEqual(expected);
      expect(mockPrisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 't1',
          name: 'Widget',
          sku: 'WDG-001',
          price: 19.99,
          currency: 'BRL',
        }),
      });
    });

    it('should use provided optional fields', async () => {
      mockPrisma.product.create.mockResolvedValue({ id: 'p2' });

      await service.create('t1', {
        name: 'Gadget',
        sku: 'GDG-001',
        price: 29.99,
        description: 'A gadget',
        category: 'electronics',
        imageUrl: 'https://img.test/gadget.png',
        currency: 'USD',
      });

      expect(mockPrisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          description: 'A gadget',
          category: 'electronics',
          imageUrl: 'https://img.test/gadget.png',
          currency: 'USD',
        }),
      });
    });
  });

  describe('findOne', () => {
    it('should return a product when found', async () => {
      const product = { id: 'p1', tenantId: 't1', name: 'Widget', active: true };
      mockPrisma.product.findFirst.mockResolvedValue(product);

      const result = await service.findOne('t1', 'p1');
      expect(result).toEqual(product);
      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', tenantId: 't1', active: true },
      });
    });

    it('should throw NotFoundException when product not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.findOne('t1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a product', async () => {
      const existing = { id: 'p1', tenantId: 't1', name: 'Widget', active: true };
      mockPrisma.product.findFirst.mockResolvedValue(existing);
      mockPrisma.product.update.mockResolvedValue({ ...existing, name: 'Updated Widget' });

      const result = await service.update('t1', 'p1', { name: 'Updated Widget' });

      expect(result.name).toBe('Updated Widget');
      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { name: 'Updated Widget' },
      });
    });

    it('should throw NotFoundException when updating nonexistent product', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.update('t1', 'bad-id', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('softDelete', () => {
    it('should set active to false', async () => {
      const existing = { id: 'p1', tenantId: 't1', active: true };
      mockPrisma.product.findFirst.mockResolvedValue(existing);
      mockPrisma.product.update.mockResolvedValue({ ...existing, active: false });

      const result = await service.softDelete('t1', 'p1');

      expect(result.active).toBe(false);
      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { active: false },
      });
    });

    it('should throw NotFoundException when product not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.softDelete('t1', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('should return paginated products with hasMore=false', async () => {
      const products = [
        { id: 'p1', tenantId: 't1', name: 'A', createdAt: new Date() },
        { id: 'p2', tenantId: 't1', name: 'B', createdAt: new Date() },
      ];
      mockPrisma.product.findMany.mockResolvedValue(products);

      const result = await service.list('t1', {}, undefined, 20);

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should return hasMore=true when more results exist', async () => {
      const products = Array.from({ length: 21 }, (_, i) => ({
        id: `p${i}`,
        tenantId: 't1',
        name: `Product ${i}`,
        createdAt: new Date(),
      }));
      mockPrisma.product.findMany.mockResolvedValue(products);

      const result = await service.list('t1', {}, undefined, 20);

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });

    it('should apply category filter', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.list('t1', { category: 'electronics' }, undefined, 20);

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'electronics' }),
        }),
      );
    });

    it('should apply price range filters', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.list('t1', { minPrice: 10, maxPrice: 100 }, undefined, 20);

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            price: { gte: 10, lte: 100 },
          }),
        }),
      );
    });

    it('should apply search term filter', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.list('t1', { searchTerm: 'gadget' }, undefined, 20);

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: { contains: 'gadget', mode: 'insensitive' } }),
            ]),
          }),
        }),
      );
    });
  });

  describe('getCategories', () => {
    it('should return distinct categories', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { category: 'electronics' },
        { category: 'clothing' },
      ]);

      const result = await service.getCategories('t1');

      expect(result).toEqual(['electronics', 'clothing']);
    });
  });

  describe('list — additional edge cases', () => {
    it('should apply inStock filter', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.list('t1', { inStock: true }, undefined, 20);

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ inStock: true }),
        }),
      );
    });

    it('should apply cursor-based pagination when cursor is provided', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ id: 'p5', createdAt: '2025-01-01T00:00:00.000Z' }),
      ).toString('base64url');
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.list('t1', {}, cursor, 10);

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'p5' },
          skip: 1,
        }),
      );
    });

    it('should apply only minPrice when maxPrice is absent', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.list('t1', { minPrice: 50 }, undefined, 20);

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            price: { gte: 50 },
          }),
        }),
      );
    });

    it('should apply only maxPrice when minPrice is absent', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.list('t1', { maxPrice: 200 }, undefined, 20);

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            price: { lte: 200 },
          }),
        }),
      );
    });

    it('should combine multiple filters simultaneously', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.list(
        't1',
        { category: 'tools', minPrice: 10, maxPrice: 50, searchTerm: 'drill' },
        undefined,
        20,
      );

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'tools',
            price: { gte: 10, lte: 50 },
            OR: expect.arrayContaining([
              expect.objectContaining({ name: { contains: 'drill', mode: 'insensitive' } }),
            ]),
          }),
        }),
      );
    });

    it('should default limit via resolveLimit when rawLimit is undefined', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.list('t1', {});

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 21 }),
      );
    });
  });

  describe('getPriceRange', () => {
    it('should return min and max prices', async () => {
      mockPrisma.product.aggregate.mockResolvedValue({
        _min: { price: 5.0 },
        _max: { price: 999.0 },
      });

      const result = await service.getPriceRange('t1');

      expect(result).toEqual({ min: 5, max: 999 });
    });

    it('should default to 0 when no products exist', async () => {
      mockPrisma.product.aggregate.mockResolvedValue({
        _min: { price: null },
        _max: { price: null },
      });

      const result = await service.getPriceRange('t1');

      expect(result).toEqual({ min: 0, max: 0 });
    });
  });
});
