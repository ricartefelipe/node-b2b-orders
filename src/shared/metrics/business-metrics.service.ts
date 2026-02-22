import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';

@Injectable()
export class BusinessMetricsService {
  readonly ordersCreated: Counter<string>;
  readonly ordersConfirmed: Counter<string>;
  readonly ordersCancelled: Counter<string>;
  readonly inventoryReserved: Counter<string>;
  readonly inventoryAdjusted: Counter<string>;

  constructor() {
    this.ordersCreated = new Counter({
      name: 'orders_created_total',
      help: 'Total orders created',
      labelNames: ['tenant_id'],
    });
    this.ordersConfirmed = new Counter({
      name: 'orders_confirmed_total',
      help: 'Total orders confirmed',
      labelNames: ['tenant_id'],
    });
    this.ordersCancelled = new Counter({
      name: 'orders_cancelled_total',
      help: 'Total orders cancelled',
      labelNames: ['tenant_id'],
    });
    this.inventoryReserved = new Counter({
      name: 'inventory_reserved_total',
      help: 'Total inventory reservation events',
      labelNames: ['tenant_id'],
    });
    this.inventoryAdjusted = new Counter({
      name: 'inventory_adjusted_total',
      help: 'Total inventory adjustments',
      labelNames: ['tenant_id', 'type'],
    });
  }
}
