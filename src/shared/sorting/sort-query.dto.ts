import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SortQueryDto {
  @ApiPropertyOptional({ description: 'Field to sort by' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

const ORDERS_SORTABLE_FIELDS = ['createdAt', 'totalAmount', 'status'] as const;
const PRODUCTS_SORTABLE_FIELDS = ['createdAt', 'name', 'price'] as const;
const INVENTORY_SORTABLE_FIELDS = ['sku', 'availableQty', 'updatedAt'] as const;

export type OrderSortField = (typeof ORDERS_SORTABLE_FIELDS)[number];
export type ProductSortField = (typeof PRODUCTS_SORTABLE_FIELDS)[number];
export type InventorySortField = (typeof INVENTORY_SORTABLE_FIELDS)[number];

export function resolveOrderSort(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Record<string, 'asc' | 'desc'> {
  if (sortBy && (ORDERS_SORTABLE_FIELDS as readonly string[]).includes(sortBy)) {
    return { [sortBy]: sortOrder };
  }
  return { createdAt: sortOrder };
}

export function resolveProductSort(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Record<string, 'asc' | 'desc'> {
  if (sortBy && (PRODUCTS_SORTABLE_FIELDS as readonly string[]).includes(sortBy)) {
    return { [sortBy]: sortOrder };
  }
  return { createdAt: sortOrder };
}

export function resolveInventorySort(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Record<string, 'asc' | 'desc'> {
  if (sortBy && (INVENTORY_SORTABLE_FIELDS as readonly string[]).includes(sortBy)) {
    return { [sortBy]: sortOrder };
  }
  return { sku: sortOrder };
}
