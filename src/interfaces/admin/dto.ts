import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, Max, Min } from 'class-validator';

export class ChaosConfigDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  failPercent!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  latencyMs!: number;
}
