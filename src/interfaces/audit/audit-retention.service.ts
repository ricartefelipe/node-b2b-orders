import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AuditRetentionService {
  private readonly logger = new Logger(AuditRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async purgeExpiredEntries(): Promise<number> {
    const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10);
    if (retentionDays <= 0) {
      this.logger.log('Audit retention disabled (AUDIT_RETENTION_DAYS <= 0)');
      return 0;
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(`Purged ${result.count} audit entries older than ${retentionDays} days`);
    }

    return result.count;
  }
}
