import { RedisService } from '../../src/infrastructure/redis/redis.service';

describe('RedisService token decode', () => {
  it('should decode sub from JWT payload without verifying', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'a@b' }))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const token = `a.${payload}.c`;
    const sub = RedisService.tryDecodeSubFromAuthHeader(`Bearer ${token}`);
    expect(sub).toBe('a@b');
  });
});
