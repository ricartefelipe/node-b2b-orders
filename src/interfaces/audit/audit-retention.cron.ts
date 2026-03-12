import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditRetentionService } from './audit-retention.service';

@Injectable()
export class AuditRetentionCron {
  private readonly logger = new Logger(AuditRetentionCron.name);

  constructor(private readonly retentionService: AuditRetentionService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleRetentionPurge(): Promise<void> {
    this.logger.log('Starting audit log retention purge...');
    try {
      const count = await this.retentionService.purgeExpiredEntries();
      this.logger.log(`Retention purge complete: ${count} entries removed`);
    } catch (err) {
      this.logger.error('Retention purge failed', (err as Error).stack);
    }
  }
}
