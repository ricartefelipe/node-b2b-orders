import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class TokenRequestDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 3 })
  @IsString()
  @MinLength(3)
  password!: string;

  @ApiPropertyOptional({ description: 'Tenant UUID when o utilizador pertence a vários' })
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class TokenResponseDto {
  @ApiProperty()
  access_token!: string;

  @ApiProperty({ example: 'Bearer' })
  token_type!: string;

  @ApiProperty({ example: 3600 })
  expires_in!: number;
}
