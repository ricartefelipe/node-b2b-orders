import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

const isJsonFormat =
  process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport: isJsonFormat
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true } },
        mixin(req: { correlationId?: string; tenantId?: string; headers?: Record<string, string | string[] | undefined> }, _res: unknown) {
          const headers = req?.headers || {};
          const getHeader = (name: string) => {
            const v = headers[name] ?? headers[name.toLowerCase()];
            return (Array.isArray(v) ? v[0] : v) ?? '';
          };
          return {
            service: 'node-b2b-orders',
            correlationId: (req as any)?.correlationId || getHeader('x-correlation-id') || '',
            tenantId: (req as any)?.tenantId || getHeader('x-tenant-id') || '',
          };
        },
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggingModule {}
