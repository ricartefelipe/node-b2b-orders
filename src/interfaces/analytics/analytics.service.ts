import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface OrdersByStatus {
  status: string;
  count: number;
  totalAmount: number;
}

export interface OrdersOverTime {
  period: string;
  count: number;
  totalAmount: number;
}

export interface TopProduct {
  sku: string;
  orderVolume: number;
  revenue: number;
}

export interface DemandAnalytics {
  ordersByStatus: OrdersByStatus[];
  ordersOverTime: OrdersOverTime[];
  topProducts: TopProduct[];
  revenueByPeriod: { daily: number; weekly: number; total: number };
}

export interface AnomalyItem {
  orderId: string;
  type: string;
  description: string;
  severity: 'high' | 'medium';
  detail?: Record<string, unknown>;
}

export interface AnomaliesAnalytics {
  highAmountOrders: AnomalyItem[];
  volumeSpikes: AnomalyItem[];
  stuckOrders: AnomalyItem[];
  unusualCancellations: AnomalyItem[];
}

export interface InventoryForecastItem {
  sku: string;
  availableQty: number;
  reservedQty: number;
  consumption7d: number;
  consumption30d: number;
  dailyConsumptionRate: number;
  estimatedDaysUntilDepletion: number | null;
  reorderSuggested: boolean;
}

export interface InventoryForecastAnalytics {
  lowStock: InventoryForecastItem[];
  consumptionSummary: InventoryForecastItem[];
  reorderSuggestions: InventoryForecastItem[];
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDemandAnalytics(tenantId: string): Promise<DemandAnalytics> {
    const [byStatus, overTime, topProducts, revenue] = await Promise.all([
      this.getOrdersByStatus(tenantId),
      this.getOrdersOverTime(tenantId),
      this.getTopProducts(tenantId),
      this.getRevenueByPeriod(tenantId),
    ]);

    return {
      ordersByStatus: byStatus,
      ordersOverTime: overTime,
      topProducts,
      revenueByPeriod: revenue,
    };
  }

  private async getOrdersByStatus(tenantId: string): Promise<OrdersByStatus[]> {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { id: true },
      _sum: { totalAmount: true },
    });
    return rows.map((r) => ({
      status: r.status,
      count: r._count.id,
      totalAmount: Number(r._sum.totalAmount ?? 0),
    }));
  }

  private async getOrdersOverTime(tenantId: string): Promise<OrdersOverTime[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orders = await this.prisma.order.findMany({
      where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, totalAmount: true },
    });

    const daily: Record<string, { count: number; totalAmount: number }> = {};
    const weekly: Record<string, { count: number; totalAmount: number }> = {};

    for (const o of orders) {
      const d = o.createdAt.toISOString().slice(0, 10);
      const w = this.getWeekKey(o.createdAt);
      if (!daily[d]) daily[d] = { count: 0, totalAmount: 0 };
      if (!weekly[w]) weekly[w] = { count: 0, totalAmount: 0 };
      daily[d].count += 1;
      daily[d].totalAmount += Number(o.totalAmount ?? 0);
      weekly[w].count += 1;
      weekly[w].totalAmount += Number(o.totalAmount ?? 0);
    }

    const result: OrdersOverTime[] = [];
    for (const [period, v] of Object.entries(daily)) {
      result.push({ period: `daily:${period}`, count: v.count, totalAmount: v.totalAmount });
    }
    for (const [period, v] of Object.entries(weekly)) {
      result.push({ period: `weekly:${period}`, count: v.count, totalAmount: v.totalAmount });
    }
    result.sort((a, b) => a.period.localeCompare(b.period));
    return result.slice(-14);
  }

  private getWeekKey(d: Date): string {
    const start = new Date(d);
    start.setDate(start.getDate() - start.getDay());
    return start.toISOString().slice(0, 10);
  }

  private async getTopProducts(tenantId: string, limit = 10): Promise<TopProduct[]> {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { tenantId } },
      select: { sku: true, qty: true, price: true },
    });

    const map = new Map<string, { volume: number; revenue: number }>();
    for (const i of items) {
      const cur = map.get(i.sku) ?? { volume: 0, revenue: 0 };
      cur.volume += i.qty;
      cur.revenue += Number(i.price) * i.qty;
      map.set(i.sku, cur);
    }

    return Array.from(map.entries())
      .map(([sku, v]) => ({ sku, orderVolume: v.volume, revenue: v.revenue }))
      .sort((a, b) => b.orderVolume - a.orderVolume)
      .slice(0, limit);
  }

  private async getRevenueByPeriod(tenantId: string) {
    const now = new Date();
    const dayAgo = new Date(now);
    dayAgo.setDate(dayAgo.getDate() - 1);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [dailySum, weeklySum, totalSum] = await Promise.all([
      this.prisma.order.aggregate({
        where: { tenantId, createdAt: { gte: dayAgo }, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { tenantId, createdAt: { gte: weekAgo }, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { tenantId, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      daily: Number(dailySum._sum.totalAmount ?? 0),
      weekly: Number(weeklySum._sum.totalAmount ?? 0),
      total: Number(totalSum._sum.totalAmount ?? 0),
    };
  }

  async getAnomalies(tenantId: string): Promise<AnomaliesAnalytics> {
    const [highAmount, stuck, volumeSpikes, cancellations] = await Promise.all([
      this.getHighAmountOrders(tenantId),
      this.getStuckOrders(tenantId),
      this.getVolumeSpikes(tenantId),
      this.getUnusualCancellations(tenantId),
    ]);

    return {
      highAmountOrders: highAmount,
      volumeSpikes,
      stuckOrders: stuck,
      unusualCancellations: cancellations,
    };
  }

  private async getHighAmountOrders(tenantId: string): Promise<AnomalyItem[]> {
    const orders = await this.prisma.order.findMany({
      where: { tenantId, totalAmount: { not: null } },
      select: { id: true, totalAmount: true },
    });

    const amounts = orders.map((o) => Number(o.totalAmount ?? 0)).filter((a) => a > 0);
    if (amounts.length < 2) return [];

    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    const std = Math.sqrt(variance);
    const threshold = mean + 3 * std;

    return orders
      .filter((o) => Number(o.totalAmount ?? 0) >= threshold)
      .map((o) => ({
        orderId: o.id,
        type: 'high_amount',
        description: `Order amount ${Number(o.totalAmount ?? 0).toFixed(2)} exceeds 3σ (${threshold.toFixed(2)})`,
        severity: 'high' as const,
        detail: { amount: Number(o.totalAmount ?? 0), mean, std, threshold },
      }));
  }

  private async getStuckOrders(tenantId: string): Promise<AnomalyItem[]> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        status: 'CONFIRMED',
        updatedAt: { lt: twentyFourHoursAgo },
      },
      select: { id: true, updatedAt: true, status: true },
    });

    return orders.map((o) => ({
      orderId: o.id,
      type: 'stuck_in_status',
      description: `Order confirmed but not paid for over 24h (since ${o.updatedAt.toISOString()})`,
      severity: 'medium' as const,
      detail: { status: o.status, updatedAt: o.updatedAt.toISOString() },
    }));
  }

  private async getVolumeSpikes(tenantId: string): Promise<AnomalyItem[]> {
    const now = new Date();
    const last24h = new Date(now);
    last24h.setHours(last24h.getHours() - 24);
    const prev24h = new Date(last24h);
    prev24h.setHours(prev24h.getHours() - 24);

    const [currentCount, previousCount] = await Promise.all([
      this.prisma.order.count({ where: { tenantId, createdAt: { gte: last24h } } }),
      this.prisma.order.count({ where: { tenantId, createdAt: { gte: prev24h, lt: last24h } } }),
    ]);

    if (previousCount === 0 && currentCount > 5) {
      return [
        {
          orderId: 'n/a',
          type: 'volume_spike',
          description: `Order volume spike: ${currentCount} orders in last 24h (vs 0 in previous 24h)`,
          severity: 'high' as const,
          detail: { current24h: currentCount, previous24h: previousCount },
        },
      ];
    }
    if (previousCount > 0 && currentCount >= previousCount * 3) {
      return [
        {
          orderId: 'n/a',
          type: 'volume_spike',
          description: `Order volume spike: ${currentCount} orders (3x previous 24h: ${previousCount})`,
          severity: 'high' as const,
          detail: { current24h: currentCount, previous24h: previousCount },
        },
      ];
    }
    return [];
  }

  private async getUnusualCancellations(tenantId: string): Promise<AnomalyItem[]> {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [total, cancelled] = await Promise.all([
      this.prisma.order.count({ where: { tenantId, createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.order.count({ where: { tenantId, status: 'CANCELLED', createdAt: { gte: sevenDaysAgo } } }),
    ]);

    const cancelRate = total > 0 ? cancelled / total : 0;
    if (total >= 10 && cancelRate > 0.5) {
      return [
        {
          orderId: 'n/a',
          type: 'unusual_cancellations',
          description: `Cancellation rate ${(cancelRate * 100).toFixed(1)}% in last 7 days (${cancelled}/${total})`,
          severity: 'medium' as const,
          detail: { cancelled, total, rate: cancelRate },
        },
      ];
    }
    return [];
  }

  async getInventoryForecast(tenantId: string, lowStockThreshold = 10): Promise<InventoryForecastAnalytics> {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId },
      select: { sku: true, availableQty: true, reservedQty: true },
    });

    const adjustments7 = await this.prisma.inventoryAdjustment.findMany({
      where: { tenantId, type: 'OUT', createdAt: { gte: sevenDaysAgo } },
      select: { sku: true, qty: true },
    });

    const adjustments30 = await this.prisma.inventoryAdjustment.findMany({
      where: { tenantId, type: 'OUT', createdAt: { gte: thirtyDaysAgo } },
      select: { sku: true, qty: true },
    });

    const out7BySku = new Map<string, number>();
    for (const a of adjustments7) {
      out7BySku.set(a.sku, (out7BySku.get(a.sku) ?? 0) + a.qty);
    }
    const out30BySku = new Map<string, number>();
    for (const a of adjustments30) {
      out30BySku.set(a.sku, (out30BySku.get(a.sku) ?? 0) + a.qty);
    }

    const result: InventoryForecastItem[] = items.map((i) => {
      const consumption7d = out7BySku.get(i.sku) ?? 0;
      const consumption30d = out30BySku.get(i.sku) ?? 0;
      const dailyRate = consumption30d > 0 ? consumption30d / 30 : consumption7d > 0 ? consumption7d / 7 : 0;
      const estDays =
        dailyRate > 0 && i.availableQty > 0 ? Math.floor(i.availableQty / dailyRate) : null;
      const reorderSuggested = i.availableQty < lowStockThreshold || (estDays !== null && estDays < 7);

      return {
        sku: i.sku,
        availableQty: i.availableQty,
        reservedQty: i.reservedQty,
        consumption7d: consumption7d,
        consumption30d: consumption30d,
        dailyConsumptionRate: Math.round(dailyRate * 100) / 100,
        estimatedDaysUntilDepletion: estDays,
        reorderSuggested,
      };
    });

    return {
      lowStock: result.filter((r) => r.availableQty < lowStockThreshold),
      consumptionSummary: result.filter((r) => r.consumption7d > 0 || r.consumption30d > 0),
      reorderSuggestions: result.filter((r) => r.reorderSuggested),
    };
  }
}
