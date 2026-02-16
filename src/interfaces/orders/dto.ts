import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

export class OrderItemDto {
  @IsString()
  sku!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateOrderRequestDto {
  @IsString()
  customerId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
