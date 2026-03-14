import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { LoggingModule } from './shared/logging/logger.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { CircuitBreakerModule } from './infrastructure/circuit-breaker/circuit-breaker.module';
import { BusinessMetricsModule } from './shared/metrics/business-metrics.module';
import { AuditModule } from './shared/audit/audit.module';
import { AuthModule } from './interfaces/auth/auth.module';
import { OrdersModule } from './interfaces/orders/orders.module';
import { ProductsModule } from './interfaces/products/products.module';
import { InventoryModule } from './interfaces/inventory/inventory.module';
import { AuditHttpModule } from './interfaces/audit/audit.module';
import { AdminModule } from './interfaces/admin/admin.module';
import { MetricsModule } from './interfaces/metrics/metrics.module';
import { AnalyticsModule } from './interfaces/analytics/analytics.module';
import { AiModule } from './interfaces/ai/ai.module';
import { EventsModule } from './interfaces/events/events.module';
import { ExportModule } from './interfaces/export/export.module';
import { ImportModule } from './interfaces/import/import.module';
import { WebhooksModule } from './interfaces/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    LoggingModule,
    PrismaModule,
    RedisModule,
    CircuitBreakerModule,
    BusinessMetricsModule,
    AuditModule,
    AuditHttpModule,
    AuthModule,
    OrdersModule,
    ProductsModule,
    InventoryModule,
    AdminModule,
    MetricsModule,
    AnalyticsModule,
    AiModule,
    EventsModule,
    ExportModule,
    ImportModule,
    WebhooksModule,
  ],
})
export class AppModule {}
