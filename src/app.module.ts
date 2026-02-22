import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { BusinessMetricsModule } from './shared/metrics/business-metrics.module';
import { AuditModule } from './shared/audit/audit.module';
import { AuthModule } from './interfaces/auth/auth.module';
import { OrdersModule } from './interfaces/orders/orders.module';
import { InventoryModule } from './interfaces/inventory/inventory.module';
import { AdminModule } from './interfaces/admin/admin.module';
import { MetricsModule } from './interfaces/metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    BusinessMetricsModule,
    AuditModule,
    AuthModule,
    OrdersModule,
    InventoryModule,
    AdminModule,
    MetricsModule,
  ],
})
export class AppModule {}
