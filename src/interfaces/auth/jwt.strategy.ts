import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const jwksUri = process.env.JWKS_URI || '';
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwksUri && !jwtSecret) {
      throw new Error(
        'Either JWKS_URI (RS256) or JWT_SECRET (HS256) must be set',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: jwksUri
        ? jwksRsa.passportJwtSecret({
            jwksUri,
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 10,
          })
        : undefined,
      secretOrKey: jwksUri ? undefined : jwtSecret,
      algorithms: [jwksUri ? 'RS256' : 'HS256'],
      issuer: process.env.JWT_ISSUER || 'local-auth',
    });
  }

  async validate(payload: any) {
    return payload;
  }
}
