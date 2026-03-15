import { Module } from '@nestjs/common';
import { TenantsProxyController } from './tenants-proxy.controller';
import { TenantsProxyService } from './tenants-proxy.service';

@Module({
  controllers: [TenantsProxyController],
  providers: [TenantsProxyService],
})
export class TenantsProxyModule {}
