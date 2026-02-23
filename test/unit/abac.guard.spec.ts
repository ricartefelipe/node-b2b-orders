import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { AbacGuard } from '../../src/shared/auth/abac.guard';

const mockReflector = {
  getAllAndOverride: jest.fn(),
};

const mockPrisma = {
  policy: { findUnique: jest.fn() },
};

const createMockContext = (user: object | undefined): ExecutionContext => {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
};

describe('AbacGuard', () => {
  let guard: AbacGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AbacGuard(
      mockPrisma as unknown as PrismaService,
      mockReflector as unknown as Reflector
    );
  });

  it('should allow when no permission required', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = createMockContext({ tid: 't1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should allow admin global user', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('orders:write');
    const ctx = createMockContext({ tid: '*', roles: ['admin'] });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(mockPrisma.policy.findUnique).not.toHaveBeenCalled();
  });

  it('should throw when user missing', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('orders:write');
    const ctx = createMockContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should deny when policy effect is deny', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('orders:write');
    mockPrisma.policy.findUnique.mockResolvedValue({
      effect: 'deny',
      allowedPlans: [],
      allowedRegions: [],
    });
    const ctx = createMockContext({ tid: 't1', plan: 'pro', region: 'region-a' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should deny when plan not in allowedPlans', async () => {
    (mockReflector.getAllAndOverride as jest.Mock).mockReturnValue('orders:write');
    (mockPrisma.policy.findUnique as jest.Mock).mockResolvedValue({
      effect: 'allow',
      allowedPlans: ['enterprise'],
      allowedRegions: ['region-a'],
    });
    const ctx = createMockContext({
      tid: 't1',
      plan: 'free',
      region: 'region-a',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should allow when plan and region match', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('orders:read');
    mockPrisma.policy.findUnique.mockResolvedValue({
      effect: 'allow',
      allowedPlans: ['pro', 'enterprise'],
      allowedRegions: ['region-a'],
    });
    const ctx = createMockContext({
      tid: 't1',
      plan: 'pro',
      region: 'region-a',
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });
});
