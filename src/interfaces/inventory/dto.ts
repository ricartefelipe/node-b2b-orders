import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum AdjustmentType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export class CreateAdjustmentDto {
  @IsString()
  sku!: string;

  @IsEnum(AdjustmentType)
  type!: AdjustmentType;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsString()
  reason!: string;
}

export class ListAdjustmentsQueryDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
