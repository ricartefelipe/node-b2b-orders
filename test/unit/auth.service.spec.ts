import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { AuthService } from '../../src/interfaces/auth/auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

const mockPrisma = {
  user: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
  userRole: { findMany: jest.fn() },
  rolePermission: { findMany: jest.fn() },
};
const mockJwt = { signAsync: jest.fn() };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      mockPrisma as unknown as PrismaService,
      mockJwt as unknown as JwtService
    );
  });

  describe('issueToken', () => {
    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const result = await service.issueToken('unknown@x.com', 'pass');
      expect(result).toBeNull();
    });

    it('should return null when password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'ops@demo',
        passwordHash: 'hash',
        tenantId: 'tenant_demo',
        isGlobalAdmin: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const result = await service.issueToken('ops@demo', 'wrong');
      expect(result).toBeNull();
    });

    it('should return token when credentials valid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'ops@demo',
        passwordHash: 'hash',
        tenantId: 'tenant_demo',
        isGlobalAdmin: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant_demo',
        plan: 'pro',
        region: 'region-a',
      });
      mockPrisma.userRole.findMany.mockResolvedValue([{ roleName: 'ops' }]);
      mockPrisma.rolePermission.findMany.mockResolvedValue([
        { permissionCode: 'orders:read' },
      ]);
      mockJwt.signAsync.mockResolvedValue('jwt-token');

      const result = await service.issueToken('ops@demo', 'ops123', 'tenant_demo');
      expect(result).toEqual({ token: 'jwt-token', expiresIn: expect.any(Number) });
    });
  });
});
