import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async issueToken(email: string, password: string, tenantId?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;

    let tid = user.isGlobalAdmin ? '*' : user.tenantId;
    if (!tid) return null;

    let plan = 'free';
    let region = 'region-a';

    if (user.isGlobalAdmin) {
      if (tenantId) {
        const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
        if (t) {
          plan = t.plan;
          region = t.region;
        }
      }
    } else {
      const t = await this.prisma.tenant.findUnique({ where: { id: tid } });
      if (t) {
        plan = t.plan;
        region = t.region;
      }
    }

    const roles = await this.resolveRoles(user.id);
    const perms = await this.resolvePerms(roles);

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = Number(process.env.TOKEN_EXPIRES_SECONDS || 3600);
    const jti = `${user.id}.${now}`;

    const payload = {
      iss: process.env.JWT_ISSUER || 'local-auth',
      sub: email,
      tid,
      roles,
      perms,
      plan,
      region,
      iat: now,
      exp: now + expiresIn,
      jti,
      ctx: { email },
    };

    const token = await this.jwt.signAsync(payload);
    return { token, expiresIn };
  }

  async resolveRoles(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({ where: { userId } });
    return rows.map((r) => r.roleName);
  }

  async resolvePerms(roles: string[]): Promise<string[]> {
    if (roles.length === 0) return [];
    const rows = await this.prisma.rolePermission.findMany({ where: { roleName: { in: roles } } });
    return Array.from(new Set(rows.map((r) => r.permissionCode))).sort();
  }
}
