import { Body, Controller, Get, Post, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { TokenRequestDto, TokenResponseDto } from './dto';
import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import type { AppFastifyRequest } from '../../shared/types/request.types';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/token')
  async token(@Body() req: TokenRequestDto): Promise<TokenResponseDto> {
    const res = await this.auth.issueToken(req.email, req.password, req.tenantId);
    if (!res) throw new UnauthorizedException('Invalid credentials');
    return { access_token: res.token, token_type: 'Bearer', expires_in: res.expiresIn };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AppFastifyRequest) {
    return req.user;
  }
}
