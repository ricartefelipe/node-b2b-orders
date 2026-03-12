import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SortQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

const ALLOWED_ORDER_SORTS = ['createdAt', 'totalAmount', 'status'];
const ALLOWED_PRODUCT_SORTS = ['createdAt', 'name', 'price'];
const ALLOWED_INVENTORY_SORTS = ['sku', 'availableQty', 'updatedAt'];

export function resolveOrderSort(sortBy?: string, sortOrder?: 'asc' | 'desc') {
  const field = ALLOWED_ORDER_SORTS.includes(sortBy || '') ? sortBy! : 'createdAt';
  return { [field]: sortOrder || 'desc' };
}

export function resolveProductSort(sortBy?: string, sortOrder?: 'asc' | 'desc') {
  const field = ALLOWED_PRODUCT_SORTS.includes(sortBy || '') ? sortBy! : 'createdAt';
  return { [field]: sortOrder || 'desc' };
}

export function resolveInventorySort(sortBy?: string, sortOrder?: 'asc' | 'desc') {
  const field = ALLOWED_INVENTORY_SORTS.includes(sortBy || '') ? sortBy! : 'sku';
  return { [field]: sortOrder || 'asc' };
}
