import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class CursorPageQuery {
  @ApiPropertyOptional({ description: 'Opaque cursor from previous page response' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DecodedCursor {
  id: string;
  createdAt: string;
}

export function encodeCursor(id: string, createdAt: Date): string {
  const payload: DecodedCursor = { id, createdAt: createdAt.toISOString() };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): DecodedCursor | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') return null;
    return parsed as DecodedCursor;
  } catch {
    return null;
  }
}

export function resolveLimit(raw?: number): number {
  if (!raw || raw < 1) return DEFAULT_LIMIT;
  return Math.min(raw, MAX_LIMIT);
}
