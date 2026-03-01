import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtUserPayload } from '../../shared/types/request.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change-me',
      issuer: process.env.JWT_ISSUER || 'local-auth',
    });
  }

  async validate(payload: JwtUserPayload): Promise<JwtUserPayload> {
    return payload;
  }
}
