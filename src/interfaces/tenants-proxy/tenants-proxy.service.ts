import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest, FastifyReply } from 'fastify';

const FORWARD_HEADERS = [
  'authorization',
  'content-type',
  'accept',
  'x-correlation-id',
  'x-tenant-id',
];

@Injectable()
export class TenantsProxyService {
  constructor(private readonly config: ConfigService) {}

  async forward(
    req: FastifyRequest,
    reply: FastifyReply,
    subPath: string,
  ): Promise<void> {
    const baseUrl =
      this.config.get<string>('CORE_API_URL') ?? this.config.get<string>('SAAS_CORE_URL');
    if (!baseUrl) {
      throw new ServiceUnavailableException(
        'Tenants proxy is not configured: CORE_API_URL is missing',
      );
    }

    const target = baseUrl.replace(/\/$/, '');
    const path = subPath ? `/${subPath}` : '';
    const query = (req.url || '').includes('?') ? (req.url || '').split('?')[1] ?? '' : '';
    const url = `${target}/v1/tenants${path}${query ? `?${query}` : ''}`;

    const headers: Record<string, string> = {};
    for (const h of FORWARD_HEADERS) {
      const v = req.headers[h];
      if (v && typeof v === 'string') headers[h] = v;
    }
    const cid = (req as { correlationId?: string }).correlationId;
    if (cid) headers['x-correlation-id'] = cid;

    const method = (req.method || 'GET').toUpperCase();
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
    let body: string | undefined;
    if (hasBody && req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const resHeaders = res.headers;
      const contentType = resHeaders.get('content-type');
      if (contentType) reply.header('content-type', contentType);

      const correlationId = resHeaders.get('x-correlation-id');
      if (correlationId) reply.header('x-correlation-id', correlationId);

      reply.code(res.status);

      const text = await res.text();
      if (text) {
        if (contentType?.includes('application/json')) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            throw new ServiceUnavailableException(
              'Tenants proxy: resposta JSON inválida do Core',
            );
          }
          // Resposta do Core (fetch servidor-side em CORE_API_URL), não input HTML do browser.
          return reply.send(parsed); // nosemgrep
        }
        // Corpo não-JSON do Core (ex.: texto plano); mesmo limite de confiança que o JSON acima.
        return reply.send(text); // nosemgrep
      }
      return reply.send();
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ServiceUnavailableException(
          'Tenants proxy request to Core timed out',
        );
      }
      throw new ServiceUnavailableException(
        `Tenants proxy error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
