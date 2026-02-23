import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ description: 'Opaque cursor from previous page response' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
