import { AdminController } from '../../src/interfaces/admin/admin.controller';
import { RedisService } from '../../src/infrastructure/redis/redis.service';

const mockRedis = {
  getChaosConfig: jest.fn(),
  setChaosConfig: jest.fn(),
};

function fakeReq(tenantId: string) {
  return { headers: { 'x-tenant-id': tenantId } } as any;
}

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminController(mockRedis as unknown as RedisService);
  });

  describe('getChaos', () => {
    it('should return chaos config for the tenant', async () => {
      const config = { enabled: true, failPercent: 25, latencyMs: 100 };
      mockRedis.getChaosConfig.mockResolvedValue(config);

      const result = await controller.getChaos(fakeReq('t1'));

      expect(result).toEqual(config);
      expect(mockRedis.getChaosConfig).toHaveBeenCalledWith('t1');
    });

    it('should return default config when nothing is stored', async () => {
      const defaults = { enabled: false, failPercent: 0, latencyMs: 0 };
      mockRedis.getChaosConfig.mockResolvedValue(defaults);

      const result = await controller.getChaos(fakeReq('t2'));

      expect(result).toEqual(defaults);
    });

    it('should pass the correct tenant from headers', async () => {
      mockRedis.getChaosConfig.mockResolvedValue({});

      await controller.getChaos(fakeReq('tenant-abc'));

      expect(mockRedis.getChaosConfig).toHaveBeenCalledWith('tenant-abc');
    });
  });

  describe('setChaos', () => {
    it('should store chaos config and return the body', async () => {
      const body = { enabled: true, failPercent: 50, latencyMs: 200 };
      mockRedis.setChaosConfig.mockResolvedValue(undefined);

      const result = await controller.setChaos(fakeReq('t1'), body as any);

      expect(result).toEqual(body);
      expect(mockRedis.setChaosConfig).toHaveBeenCalledWith('t1', body);
    });

    it('should disable chaos when enabled is false', async () => {
      const body = { enabled: false, failPercent: 0, latencyMs: 0 };
      mockRedis.setChaosConfig.mockResolvedValue(undefined);

      const result = await controller.setChaos(fakeReq('t1'), body as any);

      expect(result).toEqual(body);
      expect(mockRedis.setChaosConfig).toHaveBeenCalledWith('t1', body);
    });

    it('should pass the correct tenant from headers', async () => {
      const body = { enabled: true, failPercent: 10, latencyMs: 50 };
      mockRedis.setChaosConfig.mockResolvedValue(undefined);

      await controller.setChaos(fakeReq('tenant-xyz'), body as any);

      expect(mockRedis.setChaosConfig).toHaveBeenCalledWith('tenant-xyz', body);
    });
  });
});
