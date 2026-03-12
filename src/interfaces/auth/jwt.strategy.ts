import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';

const log = new Logger('JwtStrategy');

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const jwksUri = process.env.JWKS_URI || '';
    const jwtPublicKey = process.env.JWT_PUBLIC_KEY || '';
    const jwtAlgorithm = (process.env.JWT_ALGORITHM || 'HS256').toUpperCase();
    const jwtSecret = process.env.JWT_SECRET;
    const jwtSecretPrevious = process.env.JWT_SECRET_PREVIOUS || '';
    const issuer = process.env.JWT_ISSUER || 'local-auth';

    const useRs256 =
      jwksUri ||
      (jwtAlgorithm === 'RS256' && jwtPublicKey);
    const useHs256 = !useRs256;

    if (useRs256) {
      if (!jwksUri && !jwtPublicKey) {
        throw new Error(
          'RS256 requires JWKS_URI or JWT_PUBLIC_KEY (with JWT_ALGORITHM=RS256)',
        );
      }
    } else if (!jwtSecret) {
      throw new Error(
        'Either JWKS_URI/JWT_PUBLIC_KEY (RS256) or JWT_SECRET (HS256) must be set',
      );
    }

    const needsProvider =
      (useRs256 && (jwksUri || jwtPublicKey)) ||
      (useHs256 && jwtSecretPrevious);

    const secretOrKeyProvider = needsProvider
      ? useRs256 && jwksUri
        ? jwksRsa.passportJwtSecret({
            jwksUri,
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 10,
          })
        : useRs256 && jwtPublicKey
          ? (
              _req: unknown,
              _rawJwt: string,
              done: (err: Error | null, key?: string) => void,
            ) => done(null, jwtPublicKey)
          : (
              _req: unknown,
              rawJwt: string,
              done: (err: Error | null, key?: string) => void,
            ) => {
              const options = {
                algorithms: ['HS256' as const],
                issuer,
                ignoreExpiration: false,
              };
              try {
                jwt.verify(rawJwt, jwtSecret!, options);
                return done(null, jwtSecret!);
              } catch {
                if (jwtSecretPrevious) {
                  try {
                    jwt.verify(rawJwt, jwtSecretPrevious, options);
                    log.warn(
                      'Token verified with JWT_SECRET_PREVIOUS; consider completing rotation',
                    );
                    return done(null, jwtSecretPrevious);
                  } catch {
                    done(new Error('Invalid token'));
                  }
                } else {
                  done(new Error('Invalid token'));
                }
              }
            }
      : undefined;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider,
      secretOrKey: !secretOrKeyProvider ? jwtSecret : undefined,
      algorithms: useRs256 ? ['RS256'] : ['HS256'],
      issuer,
    });
  }

  async validate(payload: unknown) {
    return payload;
  }
}
