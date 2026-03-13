import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [EventsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
