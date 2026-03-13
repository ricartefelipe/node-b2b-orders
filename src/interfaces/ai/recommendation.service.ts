import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface RecommendedProduct {
  sku: string;
  score: number;
  reason: string;
}

export interface TrendingProduct {
  sku: string;
  orderCount: number;
  totalQty: number;
}

export interface FrequentlyBoughtTogetherItem {
  sku: string;
  coOccurrences: number;
}

export interface PersonalizedFeedItem {
  sku: string;
  score: number;
  source: 'trending' | 'history' | 'collaborative';
}

@Injectable()
export class RecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecommendationsForCustomer(
    tenantId: string,
    customerId: string,
    limit = 10,
  ): Promise<RecommendedProduct[]> {
    const customerOrders = await this.prisma.order.findMany({
      where: { tenantId, customerId },
      select: { id: true },
    });

    if (customerOrders.length === 0) {
      return [];
    }

    const orderIds = customerOrders.map((o) => o.id);

    const customerItems = await this.prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      select: { sku: true },
    });

    const purchasedSkus = new Set(customerItems.map((i) => i.sku));
    if (purchasedSkus.size === 0) {
      return [];
    }

    const skuArray = Array.from(purchasedSkus);

    const similarCustomerItems = await this.prisma.orderItem.findMany({
      where: {
        sku: { in: skuArray },
        order: { tenantId, customerId: { not: customerId } },
      },
      select: { order: { select: { customerId: true } } },
    });

    const similarCustomerIds = [
      ...new Set(similarCustomerItems.map((i) => i.order.customerId)),
    ];

    if (similarCustomerIds.length === 0) {
      return [];
    }

    const similarOrders = await this.prisma.order.findMany({
      where: { tenantId, customerId: { in: similarCustomerIds } },
      select: { id: true },
    });

    const similarOrderIds = similarOrders.map((o) => o.id);

    const candidateItems = await this.prisma.orderItem.findMany({
      where: {
        orderId: { in: similarOrderIds },
        sku: { notIn: skuArray },
      },
      select: { sku: true, qty: true },
    });

    const skuScores = new Map<string, number>();
    for (const item of candidateItems) {
      skuScores.set(item.sku, (skuScores.get(item.sku) ?? 0) + item.qty);
    }

    return Array.from(skuScores.entries())
      .map(([sku, score]) => ({
        sku,
        score,
        reason: 'collaborative_filtering',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getTrendingProducts(
    tenantId: string,
    days = 30,
    limit = 10,
  ): Promise<TrendingProduct[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const items = await this.prisma.orderItem.findMany({
      where: {
        order: { tenantId, createdAt: { gte: since } },
      },
      select: { sku: true, qty: true },
    });

    const skuAgg = new Map<string, { orderCount: number; totalQty: number }>();
    for (const item of items) {
      const cur = skuAgg.get(item.sku) ?? { orderCount: 0, totalQty: 0 };
      cur.orderCount += 1;
      cur.totalQty += item.qty;
      skuAgg.set(item.sku, cur);
    }

    return Array.from(skuAgg.entries())
      .map(([sku, agg]) => ({ sku, ...agg }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, limit);
  }

  async getFrequentlyBoughtTogether(
    tenantId: string,
    productSku: string,
    limit = 5,
  ): Promise<FrequentlyBoughtTogetherItem[]> {
    const ordersWithSku = await this.prisma.orderItem.findMany({
      where: {
        sku: productSku,
        order: { tenantId },
      },
      select: { orderId: true },
    });

    const orderIds = ordersWithSku.map((o) => o.orderId);
    if (orderIds.length === 0) {
      return [];
    }

    const coItems = await this.prisma.orderItem.findMany({
      where: {
        orderId: { in: orderIds },
        sku: { not: productSku },
      },
      select: { sku: true },
    });

    const coCount = new Map<string, number>();
    for (const item of coItems) {
      coCount.set(item.sku, (coCount.get(item.sku) ?? 0) + 1);
    }

    return Array.from(coCount.entries())
      .map(([sku, coOccurrences]) => ({ sku, coOccurrences }))
      .sort((a, b) => b.coOccurrences - a.coOccurrences)
      .slice(0, limit);
  }

  async getPersonalizedFeed(
    tenantId: string,
    customerId: string,
    limit = 20,
  ): Promise<PersonalizedFeedItem[]> {
    const [collaborative, trending] = await Promise.all([
      this.getRecommendationsForCustomer(tenantId, customerId, limit),
      this.getTrendingProducts(tenantId, 30, limit),
    ]);

    const seen = new Set<string>();
    const feed: PersonalizedFeedItem[] = [];

    for (const item of collaborative) {
      if (!seen.has(item.sku)) {
        seen.add(item.sku);
        feed.push({ sku: item.sku, score: item.score * 2, source: 'collaborative' });
      }
    }

    for (const item of trending) {
      if (!seen.has(item.sku)) {
        seen.add(item.sku);
        feed.push({ sku: item.sku, score: item.orderCount, source: 'trending' });
      }
    }

    return feed
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
