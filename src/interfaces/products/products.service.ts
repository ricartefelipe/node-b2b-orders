import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  PaginatedResponse,
  decodeCursor,
  encodeCursor,
  resolveLimit,
} from '../../shared/pagination/cursor';
import { resolveProductSort } from '../../shared/sorting/sort-query.dto';

interface ProductFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  searchTerm?: string;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantFilter(tenantId: string): Prisma.ProductWhereInput {
    return tenantId === '*' ? {} : { tenantId };
  }

  async create(tenantId: string, data: {
    name: string;
    sku: string;
    price: number;
    description?: string;
    category?: string;
    imageUrl?: string;
    currency?: string;
  }) {
    return this.prisma.product.create({
      data: {
        tenantId,
        name: data.name,
        sku: data.sku,
        price: data.price,
        description: data.description ?? '',
        category: data.category ?? '',
        imageUrl: data.imageUrl ?? '',
        currency: data.currency ?? 'BRL',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...this.tenantFilter(tenantId), active: true },
    });
    if (!product) throw new NotFoundException('product not found');
    return product;
  }

  async update(tenantId: string, id: string, data: {
    name?: string;
    sku?: string;
    price?: number;
    description?: string;
    category?: string;
    imageUrl?: string;
    currency?: string;
    inStock?: boolean;
  }) {
    await this.findOne(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data,
    });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: { active: false },
    });
  }

  async list(
    tenantId: string,
    filters: ProductFilters,
    cursor?: string,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    rawLimit?: number,
  ): Promise<PaginatedResponse<any>> {
    const limit = resolveLimit(rawLimit);
    const where: Prisma.ProductWhereInput = { ...this.tenantFilter(tenantId), active: true };

    if (filters.category) where.category = filters.category;
    if (filters.inStock !== undefined) where.inStock = filters.inStock;
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.price = {};
      if (filters.minPrice !== undefined) where.price.gte = filters.minPrice;
      if (filters.maxPrice !== undefined) where.price.lte = filters.maxPrice;
    }
    if (filters.searchTerm) {
      where.OR = [
        { name: { contains: filters.searchTerm, mode: 'insensitive' } },
        { description: { contains: filters.searchTerm, mode: 'insensitive' } },
        { sku: { contains: filters.searchTerm, mode: 'insensitive' } },
      ];
    }

    const findArgs: Prisma.ProductFindManyArgs = {
      where,
      orderBy: resolveProductSort(sortBy, sortOrder),
      take: limit + 1,
    };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        findArgs.cursor = { id: decoded.id };
        findArgs.skip = 1;
      }
    }

    const rows = await this.prisma.product.findMany(findArgs);
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.id, last.createdAt) : null;

    return { data, nextCursor, hasMore };
  }

  async getCategories(tenantId: string): Promise<string[]> {
    const results = await this.prisma.product.findMany({
      where: { ...this.tenantFilter(tenantId), active: true, category: { not: '' } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return results.map((r) => r.category);
  }

  async getPriceRange(tenantId: string): Promise<{ min: number; max: number }> {
    const result = await this.prisma.product.aggregate({
      where: { ...this.tenantFilter(tenantId), active: true },
      _min: { price: true },
      _max: { price: true },
    });
    return {
      min: Number(result._min.price ?? 0),
      max: Number(result._max.price ?? 0),
    };
  }
}
