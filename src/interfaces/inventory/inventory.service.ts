import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, sku?: string) {
    return this.prisma.inventoryItem.findMany({
      where: { tenantId, ...(sku ? { sku } : {}) },
      orderBy: { sku: 'asc' },
      take: 200,
    });
  }
}
