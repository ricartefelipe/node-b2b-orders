import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditRetentionService } from './audit-retention.service';
import { AuditRetentionCron } from './audit-retention.cron';

@Module({
  controllers: [AuditController],
  providers: [AuditRetentionService, AuditRetentionCron],
})
export class AuditHttpModule {}
