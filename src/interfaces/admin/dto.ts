import { IsBoolean, IsInt, IsNumber, Max, Min } from 'class-validator';

export class ChaosConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  failPercent!: number;

  @IsNumber()
  @Min(0)
  latencyMs!: number;
}
