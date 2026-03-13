import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ExportFilters } from './dto';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportOrders(tenantId: string, filters: ExportFilters): Promise<string> {
    const rows = await this.fetchOrders(tenantId, filters);
    const headers = ['id', 'customerId', 'status', 'totalAmount', 'trackingCode', 'createdAt', 'updatedAt', 'items'];
    return this.toCsv(
      headers,
      rows.map((o) => [
        o.id,
        o.customerId,
        o.status,
        String(o.totalAmount ?? ''),
        o.trackingCode ?? '',
        o.createdAt.toISOString(),
        o.updatedAt.toISOString(),
        JSON.stringify(o.items.map((i) => ({ sku: i.sku, qty: i.qty, price: Number(i.price) }))),
      ]),
    );
  }

  async exportOrdersJson(tenantId: string, filters: ExportFilters): Promise<object[]> {
    const orders = await this.fetchOrders(tenantId, filters);
    return orders.map((o) => ({
      ...o,
      totalAmount: o.totalAmount ? Number(o.totalAmount) : null,
      items: o.items.map((i) => ({ ...i, price: Number(i.price) })),
    }));
  }

  async exportProducts(tenantId: string): Promise<string> {
    const rows = await this.fetchProducts(tenantId);
    const headers = ['id', 'sku', 'name', 'description', 'price', 'currency', 'category', 'inStock', 'createdAt'];
    return this.toCsv(
      headers,
      rows.map((p) => [
        p.id,
        p.sku,
        p.name,
        p.description,
        String(p.price),
        p.currency,
        p.category,
        String(p.inStock),
        p.createdAt.toISOString(),
      ]),
    );
  }

  async exportProductsJson(tenantId: string): Promise<object[]> {
    const products = await this.fetchProducts(tenantId);
    return products.map((p) => ({ ...p, price: Number(p.price) }));
  }

  async exportInventory(tenantId: string): Promise<string> {
    const rows = await this.fetchInventory(tenantId);
    const headers = ['id', 'sku', 'availableQty', 'reservedQty'];
    return this.toCsv(
      headers,
      rows.map((i) => [i.id, i.sku, String(i.availableQty), String(i.reservedQty)]),
    );
  }

  private async fetchOrders(tenantId: string, filters: ExportFilters) {
    const where: Record<string, unknown> = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.dateFrom || filters.dateTo) {
      const createdAt: Record<string, Date> = {};
      if (filters.dateFrom) createdAt.gte = filters.dateFrom;
      if (filters.dateTo) createdAt.lte = filters.dateTo;
      where.createdAt = createdAt;
    }
    return this.prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async fetchProducts(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async fetchInventory(tenantId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { tenantId },
      orderBy: { sku: 'asc' },
    });
  }

  private escapeCsvField(val: string): string {
    if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  private toCsv(headers: string[], rows: string[][]): string {
    const lines = [headers.map((h) => this.escapeCsvField(h)).join(',')];
    for (const row of rows) {
      lines.push(row.map((v) => this.escapeCsvField(v)).join(','));
    }
    return lines.join('\n');
  }
}
