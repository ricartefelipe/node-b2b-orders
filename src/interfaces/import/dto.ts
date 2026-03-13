import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ImportFormat {
  CSV = 'csv',
  JSON = 'json',
}

export class ImportBodyDto {
  @ApiProperty({ enum: ImportFormat })
  @IsEnum(ImportFormat)
  format!: ImportFormat;

  @ApiProperty({ description: 'CSV string when format=csv, JSON array when format=json' })
  data!: string | object[];
}

export interface ProductImportRow {
  sku: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  category?: string;
  inStock?: boolean;
}

export interface InventoryImportRow {
  sku: string;
  qty: number;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  reason?: string;
}

export interface OrderImportRow {
  customerId: string;
  items: { sku: string; qty: number; price: number }[];
}

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  errors: ImportError[];
}
