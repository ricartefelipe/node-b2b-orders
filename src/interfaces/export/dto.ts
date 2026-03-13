import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

export class ExportOrdersQueryDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.CSV })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;

  @ApiPropertyOptional({ description: 'ISO 8601 date string (inclusive)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date string (inclusive)' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class ExportProductsQueryDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.CSV })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;
}

export interface ExportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
}
