import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../../src/shared/audit/audit.service';
import { TenantGuard } from '../../src/shared/auth/tenant.guard';

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
        method: 'GET',
        url: '/orders',
        correlationId: 'corr-1',
      }),
    }),
  } as unknown as ExecutionContext;
};

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new TenantGuard(mockAudit as unknown as AuditService);
  });

  it('should allow when tenant matches token tid', async () => {
    const ctx = createMockContext(
      { tid: '00000000-0000-0000-0000-000000000002', sub: 'u1' },
      { 'x-tenant-id': '00000000-0000-0000-0000-000000000002' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should allow wildcard tid (*)', async () => {
    const ctx = createMockContext(
      { tid: '*', sub: 'admin1' },
      { 'x-tenant-id': 'any-tenant' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should deny and log audit when X-Tenant-Id header is missing', async () => {
    const ctx = createMockContext({ tid: '00000000-0000-0000-0000-000000000002', sub: 'u1' }, {});
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'access_denied',
        detail: expect.objectContaining({
          guard: 'TenantGuard',
          reason: 'missing_tenant_id',
        }),
      }),
    );
  });

  it('should deny and log audit when user is missing', async () => {
    const ctx = createMockContext(undefined, { 'x-tenant-id': '00000000-0000-0000-0000-000000000002' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'access_denied',
        detail: expect.objectContaining({
          guard: 'TenantGuard',
          reason: 'missing_user',
        }),
      }),
    );
  });

  it('should deny and log audit when tenant mismatches token tid', async () => {
    const ctx = createMockContext(
      { tid: 'tenant_a', sub: 'u1' },
      { 'x-tenant-id': 'tenant_b' },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'access_denied',
        detail: expect.objectContaining({
          guard: 'TenantGuard',
          reason: 'tenant_mismatch',
        }),
      }),
    );
  });
});
