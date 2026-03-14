import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { DomainException } from '../exceptions/domain.exception';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred';

    if (exception instanceof DomainException) {
      status = exception.statusCode;
      detail = exception.message;
      title = this.statusToTitle(status);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        detail = response;
      } else if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        detail = (r.message as string) || (r.detail as string) || detail;
        if (Array.isArray(r.message)) {
          detail = (r.message as string[]).join('; ');
        }
      }
      title = this.statusToTitle(status);
    } else if (exception instanceof Error) {
      detail = exception.message;
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    const correlationId = (request as any).correlationId || uuidv4().replace(/-/g, '');

    const problem = {
      type: `https://httpstatuses.com/${status}`,
      title,
      status,
      detail,
      instance: request.url,
      correlationId,
      timestamp: new Date().toISOString(),
    };

    reply.status(status).header('content-type', 'application/problem+json').send(problem);
  }

  private statusToTitle(status: number): string {
    const titles: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return titles[status] || 'Error';
  }
}
