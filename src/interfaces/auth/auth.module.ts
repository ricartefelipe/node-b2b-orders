import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: (() => {
        const s = process.env.JWT_SECRET;
        if (!s) throw new Error('JWT_SECRET environment variable is required');
        return s;
      })(),
      signOptions: { algorithm: 'HS256', issuer: process.env.JWT_ISSUER || 'local-auth' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
