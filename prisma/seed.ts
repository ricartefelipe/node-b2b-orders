import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'tenant_demo';

  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: 'Demo Tenant', plan: 'pro', region: 'region-a' },
  });

  const roles = ['admin', 'ops', 'sales'];
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const perms = ['orders:write', 'orders:read', 'inventory:read', 'admin:write', 'profile:read'];
  for (const code of perms) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }

  const roleMap: Record<string, string[]> = {
    admin: perms,
    ops: ['orders:write', 'orders:read', 'inventory:read', 'profile:read'],
    sales: ['orders:read', 'inventory:read', 'profile:read'],
  };

  for (const [roleName, pList] of Object.entries(roleMap)) {
    for (const permissionCode of pList) {
      await prisma.rolePermission.upsert({
        where: { roleName_permissionCode: { roleName, permissionCode } },
        update: {},
        create: { roleName, permissionCode },
      });
    }
  }

  const policies = [
    { permissionCode: 'orders:write', allowedPlans: ['pro', 'enterprise'], allowedRegions: ['region-a', 'region-b'] },
    { permissionCode: 'orders:read', allowedPlans: ['free', 'pro', 'enterprise'], allowedRegions: ['region-a', 'region-b'] },
    { permissionCode: 'inventory:read', allowedPlans: ['free', 'pro', 'enterprise'], allowedRegions: ['region-a', 'region-b'] },
    { permissionCode: 'admin:write', allowedPlans: ['enterprise'], allowedRegions: ['region-a', 'region-b'] },
    { permissionCode: 'profile:read', allowedPlans: ['free', 'pro', 'enterprise'], allowedRegions: ['region-a', 'region-b'] },
  ];

  for (const p of policies) {
    await prisma.policy.upsert({
      where: { permissionCode: p.permissionCode },
      update: { effect: 'allow', allowedPlans: p.allowedPlans, allowedRegions: p.allowedRegions },
      create: { permissionCode: p.permissionCode, effect: 'allow', allowedPlans: p.allowedPlans, allowedRegions: p.allowedRegions },
    });
  }

  const adminHash = await bcrypt.hash('admin123', 10);
  const opsHash = await bcrypt.hash('ops123', 10);
  const salesHash = await bcrypt.hash('sales123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@local' },
    update: { isGlobalAdmin: true },
    create: { email: 'admin@local', passwordHash: adminHash, isGlobalAdmin: true },
  });

  const ops = await prisma.user.upsert({
    where: { email: 'ops@demo' },
    update: { tenantId },
    create: { email: 'ops@demo', passwordHash: opsHash, tenantId },
  });

  const sales = await prisma.user.upsert({
    where: { email: 'sales@demo' },
    update: { tenantId },
    create: { email: 'sales@demo', passwordHash: salesHash, tenantId },
  });

  await prisma.userRole.upsert({
    where: { userId_roleName: { userId: admin.id, roleName: 'admin' } },
    update: {},
    create: { userId: admin.id, roleName: 'admin' },
  });
  await prisma.userRole.upsert({
    where: { userId_roleName: { userId: ops.id, roleName: 'ops' } },
    update: {},
    create: { userId: ops.id, roleName: 'ops' },
  });
  await prisma.userRole.upsert({
    where: { userId_roleName: { userId: sales.id, roleName: 'sales' } },
    update: {},
    create: { userId: sales.id, roleName: 'sales' },
  });

  // Inventory seed
  const skus = [
    { sku: 'SKU-1', availableQty: 100 },
    { sku: 'SKU-2', availableQty: 50 },
  ];
  for (const item of skus) {
    await prisma.inventoryItem.upsert({
      where: { tenantId_sku: { tenantId, sku: item.sku } },
      update: { availableQty: item.availableQty },
      create: { tenantId, sku: item.sku, availableQty: item.availableQty, reservedQty: 0 },
    });
  }

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
