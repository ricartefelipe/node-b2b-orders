import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class OrderItemDto {
  @ApiProperty()
  @IsString()
  sku!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateOrderRequestDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

export class ShipOrderDto {
  @ApiProperty()
  @IsString()
  trackingCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackingUrl?: string;
}
