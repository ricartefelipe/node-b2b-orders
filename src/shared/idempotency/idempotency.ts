import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

/** Escopos de idempotência: a chave do cliente só vale dentro do tenant e da operação. */
export const IDEMPOTENCY_SCOPE = {
  createOrder: 'create-order',
  inventoryAdjustment: 'inventory-adjustment',
} as const;

export type IdempotencyScope = (typeof IDEMPOTENCY_SCOPE)[keyof typeof IDEMPOTENCY_SCOPE];

/** O que fica guardado por chave: a resposta devolvida e a impressão digital do pedido que a gerou. */
export type IdempotentEntry<TResponse = unknown> = {
  fingerprint: string;
  response: TResponse;
};

const IDEMPOTENCY_UNIQUE_COLUMNS = ['tenant_id', 'scope', 'key'];

/**
 * Impressão digital canônica e versionada: só os campos que definem a operação, em ordem
 * estável. Mudar a versão invalida comparações com registros antigos de forma explícita.
 */
export function fingerprintOf(version: string, lines: readonly string[]): string {
  return createHash('sha256').update([version, ...lines].join('\n')).digest('hex');
}

/** Um registro só é reaproveitável quando traz a impressão digital que o gerou. */
export function isIdempotentEntry(value: unknown): value is IdempotentEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as IdempotentEntry).fingerprint === 'string' &&
    'response' in value
  );
}

/**
 * Violação da unicidade (tenant, escopo, chave) do registro durável: outra requisição com a
 * mesma chave venceu a corrida. Qualquer outro erro de banco não é conflito e deve subir.
 */
export function isIdempotencyRecordConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const columns = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
  return IDEMPOTENCY_UNIQUE_COLUMNS.every((column) => columns.some((c) => c.includes(column)));
}
