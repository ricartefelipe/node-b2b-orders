import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  permission?: string;
}

export interface AiDocsResponse {
  apiOverview: {
    title: string;
    version: string;
    basePath: string;
    endpoints: ApiEndpoint[];
  };
  orderStatistics: {
    byStatus: { status: string; count: number }[];
    total: number;
  };
  systemHealth: {
    database: 'ok' | 'fail';
    redis: 'ok' | 'fail';
    nodeEnv: string;
  };
  recentActivity: {
    last24h: { action: string; count: number }[];
    totalEvents: number;
  };
  dataModel: {
    entities: { name: string; description: string }[];
  };
}

@Injectable()
export class AiDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getStructuredDocs(tenantId: string): Promise<AiDocsResponse> {
    const [orderStats, health, recentActivity] = await Promise.all([
      this.getOrderStatistics(tenantId),
      this.getSystemHealth(),
      this.getRecentActivity(tenantId),
    ]);

    return {
      apiOverview: this.getApiOverview(),
      orderStatistics: orderStats,
      systemHealth: health,
      recentActivity,
      dataModel: this.getDataModelOverview(),
    };
  }

  private getApiOverview() {
    return {
      title: 'node-b2b-orders',
      version: '1.0.0',
      basePath: '/v1',
      endpoints: [
        { method: 'POST', path: '/v1/orders', description: 'Create order', permission: 'orders:write' },
        { method: 'GET', path: '/v1/orders', description: 'List orders with filters', permission: 'orders:read' },
        { method: 'GET', path: '/v1/orders/:id', description: 'Get order by ID', permission: 'orders:read' },
        { method: 'POST', path: '/v1/orders/:id/confirm', description: 'Confirm order', permission: 'orders:write' },
        { method: 'POST', path: '/v1/orders/:id/ship', description: 'Ship order', permission: 'orders:write' },
        { method: 'POST', path: '/v1/orders/:id/deliver', description: 'Mark as delivered', permission: 'orders:write' },
        { method: 'POST', path: '/v1/orders/:id/cancel', description: 'Cancel order', permission: 'orders:write' },
        { method: 'GET', path: '/v1/products', description: 'List products', permission: 'products:read' },
        { method: 'GET', path: '/v1/products/:id', description: 'Get product', permission: 'products:read' },
        { method: 'GET', path: '/v1/inventory', description: 'List inventory', permission: 'inventory:read' },
        { method: 'POST', path: '/v1/inventory/adjust', description: 'Adjust inventory', permission: 'inventory:write' },
        { method: 'GET', path: '/v1/audit', description: 'Query audit log', permission: 'audit:read' },
        { method: 'GET', path: '/v1/audit/export', description: 'Export audit log', permission: 'audit:read' },
        { method: 'GET', path: '/v1/analytics/demand', description: 'Demand analytics', permission: 'analytics:read' },
        { method: 'GET', path: '/v1/analytics/anomalies', description: 'Order anomalies', permission: 'analytics:read' },
        { method: 'GET', path: '/v1/analytics/inventory-forecast', description: 'Inventory forecast', permission: 'analytics:read' },
        { method: 'GET', path: '/v1/ai/docs', description: 'Structured docs for AI agents', permission: 'analytics:read' },
      ],
    };
  }

  private async getOrderStatistics(tenantId: string) {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { id: true },
    });
    const byStatus = rows.map((r) => ({ status: r.status, count: r._count.id }));
    const total = byStatus.reduce((s, r) => s + r.count, 0);
    return { byStatus, total };
  }

  private async getSystemHealth(): Promise<AiDocsResponse['systemHealth']> {
    let db: 'ok' | 'fail' = 'ok';
    let redis: 'ok' | 'fail' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'fail';
    }
    try {
      await this.redis.raw.ping();
    } catch {
      redis = 'fail';
    }
    return {
      database: db,
      redis,
      nodeEnv: process.env.NODE_ENV ?? 'development',
    };
  }

  private async getRecentActivity(tenantId: string) {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const logs = await this.prisma.auditLog.findMany({
      where: { tenantId, createdAt: { gte: twentyFourHoursAgo } },
      select: { action: true },
    });

    const byAction = new Map<string, number>();
    for (const l of logs) {
      byAction.set(l.action, (byAction.get(l.action) ?? 0) + 1);
    }

    const last24h = Array.from(byAction.entries()).map(([action, count]) => ({ action, count }));
    last24h.sort((a, b) => b.count - a.count);

    return { last24h, totalEvents: logs.length };
  }

  private getDataModelOverview() {
    return {
      entities: [
        { name: 'Order', description: 'Purchase order with status lifecycle (CREATED→CONFIRMED→PAID→SHIPPED→DELIVERED or CANCELLED)' },
        { name: 'OrderItem', description: 'Line item (sku, qty, price) in an order' },
        { name: 'Product', description: 'Catalog product (sku, name, price, category)' },
        { name: 'InventoryItem', description: 'Stock per tenant/sku (availableQty, reservedQty)' },
        { name: 'InventoryAdjustment', description: 'Stock movement (IN, OUT, ADJUSTMENT)' },
        { name: 'AuditLog', description: 'Audit trail of actions' },
        { name: 'OutboxEvent', description: 'Domain events for async publishing' },
      ],
    };
  }
}
