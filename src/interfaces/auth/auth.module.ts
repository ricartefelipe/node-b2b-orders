import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register((() => {
      const jwksUri = process.env.JWKS_URI || '';
      const jwtSecret = process.env.JWT_SECRET;
      const algorithm = jwksUri ? 'RS256' : 'HS256';

      if (jwksUri) {
        return {
          signOptions: { algorithm, issuer: process.env.JWT_ISSUER || 'local-auth' },
        };
      }

      if (!jwtSecret) {
        throw new Error('Either JWKS_URI (RS256) or JWT_SECRET (HS256) must be set');
      }
      return {
        secret: jwtSecret,
        signOptions: { algorithm, issuer: process.env.JWT_ISSUER || 'local-auth' },
      };
    })()),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
