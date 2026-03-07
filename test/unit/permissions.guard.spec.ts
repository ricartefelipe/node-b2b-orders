import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../../src/shared/audit/audit.service';
import { PermissionsGuard } from '../../src/shared/auth/permissions.guard';

const mockReflector = { getAllAndOverride: jest.fn() };
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

const createMockContext = (
  user: object | undefined,
  headers: Record<string, string> = {},
): ExecutionContext => {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        headers,
        method: 'POST',
        url: '/orders',
        correlationId: 'corr-1',
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
};

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionsGuard(
      mockReflector as unknown as Reflector,
      mockAudit as unknown as AuditService,
    );
  });

  it('should allow when no permission is required', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = createMockContext({ tid: 't1', sub: 'u1', perms: [] });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should allow when user has the required permission', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('orders:read');
    const ctx = createMockContext(
      { tid: 't1', sub: 'u1', perms: ['orders:read', 'orders:write'] },
      { 'x-tenant-id': 't1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(mockAudit.log).not.toHaveBeenCalled();
  });

  it('should allow global admin with wildcard tid', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('orders:write');
    const ctx = createMockContext(
      { tid: '*', roles: ['admin'], sub: 'admin1' },
      { 'x-tenant-id': 't1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should deny and log audit when user is missing', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('orders:read');
    const ctx = createMockContext(undefined, { 'x-tenant-id': 't1' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'access_denied',
        detail: expect.objectContaining({
          guard: 'PermissionsGuard',
          reason: 'missing_user',
        }),
      }),
    );
  });

  it('should deny and log audit when permission is missing', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('orders:write');
    const ctx = createMockContext(
      { tid: 't1', sub: 'u1', perms: ['orders:read'] },
      { 'x-tenant-id': 't1' },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'access_denied',
        detail: expect.objectContaining({
          guard: 'PermissionsGuard',
          permission: 'orders:write',
          reason: 'missing_permission',
        }),
      }),
    );
  });

  it('should deny non-admin with wildcard tid but without admin role', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('orders:write');
    const ctx = createMockContext(
      { tid: '*', roles: ['viewer'], sub: 'u1', perms: [] },
      { 'x-tenant-id': 't1' },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
