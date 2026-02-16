import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class TokenRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  password!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class TokenResponseDto {
  access_token!: string;
  token_type!: string;
  expires_in!: number;
}
