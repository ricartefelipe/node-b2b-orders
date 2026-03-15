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

  const perms = [
    'orders:write',
    'orders:read',
    'inventory:read',
    'inventory:write',
    'products:read',
    'products:write',
    'admin:write',
    'profile:read',
    'analytics:read',
  ];
  for (const code of perms) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }

  const roleMap: Record<string, string[]> = {
    admin: perms,
    ops: ['orders:write', 'orders:read', 'inventory:read', 'inventory:write', 'products:read', 'products:write', 'profile:read', 'analytics:read'],
    sales: ['orders:read', 'inventory:read', 'products:read', 'profile:read', 'analytics:read'],
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
    { permissionCode: 'orders:write', allowedPlans: '["pro","enterprise"]', allowedRegions: '[]' },
    { permissionCode: 'orders:read', allowedPlans: '[]', allowedRegions: '[]' },
    { permissionCode: 'inventory:read', allowedPlans: '[]', allowedRegions: '[]' },
    { permissionCode: 'inventory:write', allowedPlans: '["pro","enterprise"]', allowedRegions: '[]' },
    { permissionCode: 'products:read', allowedPlans: '[]', allowedRegions: '[]' },
    { permissionCode: 'products:write', allowedPlans: '["pro","enterprise"]', allowedRegions: '[]' },
    { permissionCode: 'admin:write', allowedPlans: '["enterprise"]', allowedRegions: '[]' },
    { permissionCode: 'profile:read', allowedPlans: '[]', allowedRegions: '[]' },
    { permissionCode: 'analytics:read', allowedPlans: '["pro","enterprise"]', allowedRegions: '[]' },
  ];

  for (const p of policies) {
    const existing = await prisma.policy.findFirst({ where: { permissionCode: p.permissionCode } });
    if (existing) {
      await prisma.policy.update({
        where: { id: existing.id },
        data: { effect: 'ALLOW', allowedPlans: p.allowedPlans, allowedRegions: p.allowedRegions, enabled: true },
      });
    } else {
      await prisma.policy.create({
        data: {
          permissionCode: p.permissionCode,
          effect: 'ALLOW',
          allowedPlans: p.allowedPlans,
          allowedRegions: p.allowedRegions,
          enabled: true,
        },
      });
    }
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
    where: { email: 'ops@demo.example.com' },
    update: { tenantId },
    create: { email: 'ops@demo.example.com', passwordHash: opsHash, tenantId },
  });

  const sales = await prisma.user.upsert({
    where: { email: 'sales@demo.example.com' },
    update: { tenantId },
    create: { email: 'sales@demo.example.com', passwordHash: salesHash, tenantId },
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

  const products = [
    { sku: 'ELET-001', name: 'Notebook Corporativo 15"', price: 4899.90, category: 'Eletrônicos', description: 'Notebook profissional com 16GB RAM, SSD 512GB, tela IPS Full HD', rating: 4.5, reviewCount: 128, imageUrl: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'ELET-002', name: 'Monitor Ultrawide 34"', price: 3299.00, category: 'Eletrônicos', description: 'Monitor curvo 34 polegadas UWQHD, ideal para produtividade', rating: 4.7, reviewCount: 85, imageUrl: 'https://images.unsplash.com/photo-1585792180666-f7347c490ee2?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'ELET-003', name: 'Teclado Mecânico Sem Fio', price: 489.90, category: 'Eletrônicos', description: 'Teclado mecânico Bluetooth/USB-C, switches silenciosos', rating: 4.3, reviewCount: 214, imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'ELET-004', name: 'Mouse Ergonômico Vertical', price: 259.90, category: 'Eletrônicos', description: 'Mouse vertical wireless com 6 botões programáveis', rating: 4.1, reviewCount: 167, imageUrl: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'ELET-005', name: 'Webcam Full HD com Microfone', price: 349.90, category: 'Eletrônicos', description: 'Webcam 1080p com autofoco e cancelamento de ruído', rating: 4.0, reviewCount: 92, imageUrl: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'ESCR-001', name: 'Cadeira Executiva Premium', price: 2199.00, category: 'Escritório', description: 'Cadeira ergonômica com apoio lombar ajustável e braços 4D', rating: 4.6, reviewCount: 301, imageUrl: 'https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'ESCR-002', name: 'Mesa Elevatória 160cm', price: 3499.00, category: 'Escritório', description: 'Mesa sit-stand elétrica com memória de posições, tampo MDP', rating: 4.8, reviewCount: 56, imageUrl: 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'ESCR-003', name: 'Organizador de Cabos Kit', price: 79.90, category: 'Escritório', description: 'Kit com 20 presilhas, 2 canaletas e 5 etiquetas para organização', rating: 3.9, reviewCount: 420, imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'ESCR-004', name: 'Luminária LED de Mesa', price: 189.90, category: 'Escritório', description: 'Luminária LED com 5 níveis de brilho e temperatura de cor ajustável', rating: 4.4, reviewCount: 178, imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057ab6fe?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'ESCR-005', name: 'Apoio para Pés Ajustável', price: 149.90, category: 'Escritório', description: 'Apoio ergonômico com inclinação regulável e superfície antiderrapante', rating: 4.2, reviewCount: 95, imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'IND-001', name: 'Compressor de Ar 50L', price: 1899.00, category: 'Industrial', description: 'Compressor industrial 2HP, tanque 50 litros, pressão máx 120 PSI', rating: 4.3, reviewCount: 44, imageUrl: 'https://images.unsplash.com/photo-1530124566582-a45a7e3f5803?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'IND-002', name: 'Furadeira de Coluna', price: 2799.00, category: 'Industrial', description: 'Furadeira de bancada 16mm com motor 750W e mesa inclinável', rating: 4.5, reviewCount: 32, imageUrl: 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'IND-003', name: 'Empilhadeira Manual 2T', price: 4599.00, category: 'Industrial', description: 'Empilhadeira hidráulica manual, capacidade 2000kg, garfos 1150mm', rating: 4.7, reviewCount: 18, imageUrl: 'https://images.unsplash.com/photo-1553413077-190dd305871c?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'IND-004', name: 'Estante Industrial 5 Níveis', price: 689.90, category: 'Industrial', description: 'Estante metálica 200x100x50cm, capacidade 350kg por prateleira', rating: 4.1, reviewCount: 76, imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'IND-005', name: 'Caixa de Ferramentas Profissional', price: 459.90, category: 'Industrial', description: 'Caixa sanfonada com 5 gavetas, 65 peças incluídas', rating: 4.4, reviewCount: 112, imageUrl: 'https://images.unsplash.com/photo-1581783898377-1c85bf937427?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'SEG-001', name: 'Câmera IP PoE 4MP', price: 599.90, category: 'Segurança', description: 'Câmera bullet com visão noturna 30m, IP67, detecção de movimento', rating: 4.6, reviewCount: 203, imageUrl: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'SEG-002', name: 'Controle de Acesso Biométrico', price: 1299.00, category: 'Segurança', description: 'Leitor biométrico com facial e digital, capacidade 3000 usuários', rating: 4.2, reviewCount: 67, imageUrl: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'SEG-003', name: 'Fechadura Digital Smart', price: 899.90, category: 'Segurança', description: 'Fechadura com senha, cartão RFID, biometria e app mobile', rating: 4.0, reviewCount: 145, imageUrl: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'SEG-004', name: 'Cofre Digital 50L', price: 1599.00, category: 'Segurança', description: 'Cofre eletrônico com teclado e chave de emergência, anti-arrombamento', rating: 4.5, reviewCount: 38, imageUrl: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'SEG-005', name: 'Kit Alarme Empresarial', price: 2199.00, category: 'Segurança', description: 'Central de alarme com 8 zonas, 4 sensores IR e 2 controles', rating: 4.3, reviewCount: 54, imageUrl: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'LIMP-001', name: 'Lavadora de Alta Pressão Industrial', price: 3299.00, category: 'Limpeza', description: 'Lavadora 2500 PSI com motor de indução, uso contínuo', rating: 4.7, reviewCount: 89, imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'LIMP-002', name: 'Aspirador Industrial 80L', price: 2499.00, category: 'Limpeza', description: 'Aspirador sólidos e líquidos 80L com 2 motores, 2400W', rating: 4.4, reviewCount: 61, imageUrl: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'LIMP-003', name: 'Enceradeira Industrial 510mm', price: 1899.00, category: 'Limpeza', description: 'Enceradeira com disco de 510mm para grandes áreas', rating: 4.1, reviewCount: 27, imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'LIMP-004', name: 'Dispensador de Papel Toalha', price: 129.90, category: 'Limpeza', description: 'Dispensador em ABS para papel interfolhado, fixação parede', rating: 3.8, reviewCount: 312, imageUrl: 'https://images.unsplash.com/photo-1584813539510-2c8e0e16c851?w=400&h=400&fit=crop', currency: 'BRL' },
    { sku: 'LIMP-005', name: 'Kit Limpeza Profissional', price: 349.90, category: 'Limpeza', description: 'Balde espremedor, mop profissional, rodo 60cm e pulverizador 2L', rating: 4.2, reviewCount: 198, imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=400&h=400&fit=crop', currency: 'BRL' },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId, sku: p.sku } },
      update: { name: p.name, price: p.price, category: p.category, description: p.description, rating: p.rating, reviewCount: p.reviewCount, imageUrl: p.imageUrl, currency: p.currency },
      create: {
        tenantId,
        sku: p.sku,
        name: p.name,
        price: p.price,
        currency: p.currency,
        category: p.category,
        description: p.description,
        imageUrl: p.imageUrl,
        rating: p.rating,
        reviewCount: p.reviewCount,
      },
    });
  }

  const inventoryItems = [
    { sku: 'SKU-1', availableQty: 100 },
    { sku: 'SKU-2', availableQty: 50 },
    ...products.map(p => ({ sku: p.sku, availableQty: 30 })),
  ];
  for (const item of inventoryItems) {
    await prisma.inventoryItem.upsert({
      where: { tenantId_sku: { tenantId, sku: item.sku } },
      update: {},
      create: { tenantId, sku: item.sku, availableQty: item.availableQty, reservedQty: 0 },
    });
  }

  // --- Additional tenant ---
  const tenantId2 = '00000000-0000-0000-0000-000000000003';
  await prisma.tenant.upsert({
    where: { id: tenantId2 },
    update: {},
    create: { id: tenantId2, name: 'Acme Distribuidora', plan: 'pro', region: 'sa-east-1' },
  });

  // Products and inventory for second tenant
  for (const p of products) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenantId2, sku: p.sku } },
      update: {},
      create: {
        tenantId: tenantId2,
        sku: p.sku,
        name: p.name,
        price: p.price,
        currency: p.currency,
        category: p.category,
        description: p.description,
        imageUrl: p.imageUrl,
        rating: p.rating,
        reviewCount: p.reviewCount,
      },
    });
  }
  for (const item of inventoryItems) {
    await prisma.inventoryItem.upsert({
      where: { tenantId_sku: { tenantId: tenantId2, sku: item.sku } },
      update: {},
      create: { tenantId: tenantId2, sku: item.sku, availableQty: item.availableQty, reservedQty: 0 },
    });
  }

  // --- Orders (15 orders, varied statuses, 3 months) ---
  const orderDefs = [
    { id: 'a0000001-0000-4000-8000-000000000001', tenantId, customerId: 'cust-abc-001', status: 'CREATED', createdAt: new Date('2025-12-15T09:00:00Z'), items: [{ sku: 'ELET-001', qty: 2, price: 4899.90 }] },
    { id: 'a0000002-0000-4000-8000-000000000002', tenantId, customerId: 'cust-xyz-001', status: 'CREATED', createdAt: new Date('2025-12-22T14:30:00Z'), items: [{ sku: 'ESCR-001', qty: 1, price: 2199.00 }, { sku: 'ELET-003', qty: 5, price: 489.90 }] },
    { id: 'a0000003-0000-4000-8000-000000000003', tenantId, customerId: 'cust-sp-001', status: 'CONFIRMED', createdAt: new Date('2025-12-28T11:15:00Z'), items: [{ sku: 'IND-001', qty: 1, price: 1899.00 }] },
    { id: 'a0000004-0000-4000-8000-000000000004', tenantId, customerId: 'cust-sul-001', status: 'CONFIRMED', createdAt: new Date('2026-01-05T16:45:00Z'), items: [{ sku: 'SEG-001', qty: 4, price: 599.90 }, { sku: 'SEG-002', qty: 1, price: 1299.00 }] },
    { id: 'a0000005-0000-4000-8000-000000000005', tenantId: tenantId2, customerId: 'cust-log-001', status: 'CONFIRMED', createdAt: new Date('2026-01-12T08:20:00Z'), items: [{ sku: 'LIMP-001', qty: 1, price: 3299.00 }, { sku: 'LIMP-002', qty: 2, price: 2499.00 }] },
    { id: 'a0000006-0000-4000-8000-000000000006', tenantId, customerId: 'cust-metal-001', status: 'SHIPPED', createdAt: new Date('2025-12-18T10:00:00Z'), shippedAt: new Date('2025-12-20T14:00:00Z'), trackingCode: 'BR123456789', trackingUrl: 'https://correios.com.br/rastreio/BR123456789', items: [{ sku: 'IND-003', qty: 1, price: 4599.00 }] },
    { id: 'a0000007-0000-4000-8000-000000000007', tenantId, customerId: 'cust-off-001', status: 'SHIPPED', createdAt: new Date('2026-01-02T09:30:00Z'), shippedAt: new Date('2026-01-04T11:00:00Z'), trackingCode: 'JADEF123456', trackingUrl: 'https://jadlog.com/rastreio/JADEF123456', items: [{ sku: 'ESCR-002', qty: 2, price: 3499.00 }, { sku: 'ESCR-001', qty: 2, price: 2199.00 }] },
    { id: 'a0000008-0000-4000-8000-000000000008', tenantId: tenantId2, customerId: 'cust-var-001', status: 'SHIPPED', createdAt: new Date('2026-01-15T13:00:00Z'), shippedAt: new Date('2026-01-17T09:00:00Z'), trackingCode: 'AZUL987654', trackingUrl: 'https://azulcargo.com/rastreio/AZUL987654', items: [{ sku: 'ELET-002', qty: 3, price: 3299.00 }] },
    { id: 'a0000009-0000-4000-8000-000000000009', tenantId, customerId: 'cust-tec-001', status: 'SHIPPED', createdAt: new Date('2026-02-01T10:00:00Z'), shippedAt: new Date('2026-02-03T08:00:00Z'), trackingCode: 'TNT543210', trackingUrl: 'https://tnt.com/rastreio/TNT543210', items: [{ sku: 'ELET-001', qty: 5, price: 4899.90 }, { sku: 'ELET-004', qty: 10, price: 259.90 }, { sku: 'ELET-005', qty: 5, price: 349.90 }] },
    { id: 'a0000010-0000-4000-8000-000000000010', tenantId, customerId: 'cust-ferr-001', status: 'DELIVERED', createdAt: new Date('2025-12-10T08:00:00Z'), shippedAt: new Date('2025-12-12T10:00:00Z'), deliveredAt: new Date('2025-12-15T16:30:00Z'), trackingCode: 'BR111222333', trackingUrl: 'https://correios.com.br/rastreio/BR111222333', items: [{ sku: 'IND-005', qty: 3, price: 459.90 }] },
    { id: 'a0000011-0000-4000-8000-000000000011', tenantId, customerId: 'cust-const-001', status: 'DELIVERED', createdAt: new Date('2025-12-20T11:00:00Z'), shippedAt: new Date('2025-12-22T09:00:00Z'), deliveredAt: new Date('2025-12-24T14:00:00Z'), trackingCode: 'BR444555666', trackingUrl: 'https://correios.com.br/rastreio/BR444555666', items: [{ sku: 'IND-004', qty: 5, price: 689.90 }, { sku: 'IND-002', qty: 1, price: 2799.00 }] },
    { id: 'a0000012-0000-4000-8000-000000000012', tenantId: tenantId2, customerId: 'cust-mg-001', status: 'DELIVERED', createdAt: new Date('2026-01-08T14:00:00Z'), shippedAt: new Date('2026-01-10T08:00:00Z'), deliveredAt: new Date('2026-01-13T17:00:00Z'), trackingCode: 'JAD789012', trackingUrl: 'https://jadlog.com/rastreio/JAD789012', items: [{ sku: 'SEG-005', qty: 1, price: 2199.00 }, { sku: 'SEG-003', qty: 2, price: 899.90 }] },
    { id: 'a0000013-0000-4000-8000-000000000013', tenantId, customerId: 'cust-hosp-001', status: 'DELIVERED', createdAt: new Date('2026-01-25T09:00:00Z'), shippedAt: new Date('2026-01-27T11:00:00Z'), deliveredAt: new Date('2026-01-30T10:00:00Z'), trackingCode: 'AZUL345678', trackingUrl: 'https://azulcargo.com/rastreio/AZUL345678', items: [{ sku: 'LIMP-004', qty: 20, price: 129.90 }, { sku: 'LIMP-005', qty: 10, price: 349.90 }] },
    { id: 'a0000014-0000-4000-8000-000000000014', tenantId, customerId: 'cust-arm-001', status: 'DELIVERED', createdAt: new Date('2026-02-20T08:00:00Z'), shippedAt: new Date('2026-02-22T09:00:00Z'), deliveredAt: new Date('2026-02-25T15:00:00Z'), trackingCode: 'TNT999888', trackingUrl: 'https://tnt.com/rastreio/TNT999888', items: [{ sku: 'ESCR-003', qty: 50, price: 79.90 }, { sku: 'ESCR-004', qty: 15, price: 189.90 }] },
    { id: 'a0000015-0000-4000-8000-000000000015', tenantId: tenantId2, customerId: 'cust-canc-001', status: 'CANCELLED', createdAt: new Date('2026-03-05T12:00:00Z'), items: [{ sku: 'SEG-004', qty: 2, price: 1599.00 }] },
  ];

  let orderItemSeq = 1;
  for (const def of orderDefs) {
    const totalAmount = def.items.reduce((sum, i) => sum + i.price * i.qty, 0);
    await prisma.order.upsert({
      where: { id: def.id },
      update: {},
      create: {
        id: def.id,
        tenantId: def.tenantId,
        customerId: def.customerId,
        status: def.status,
        totalAmount,
        trackingCode: def.trackingCode ?? null,
        trackingUrl: def.trackingUrl ?? null,
        shippedAt: def.shippedAt ?? null,
        deliveredAt: def.deliveredAt ?? null,
        createdAt: def.createdAt,
      },
    });
    for (let i = 0; i < def.items.length; i++) {
      const item = def.items[i];
      const itemId = `b${String(orderItemSeq).padStart(7, '0')}-0000-4000-8000-${String(orderItemSeq).padStart(12, '0')}`;
      orderItemSeq++;
      await prisma.orderItem.upsert({
        where: { id: itemId },
        update: {},
        create: {
          id: itemId,
          orderId: def.id,
          sku: item.sku,
          qty: item.qty,
          price: item.price,
        },
      });
    }
  }

  // --- Inventory Adjustments (20) ---
  const adjustmentDefs = [
    { tenantId, sku: 'ELET-001', type: 'IN', qty: 50, reason: 'Recebimento NF 12345', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-001', idempotencyKey: 'adj-seed-001', createdAt: new Date('2025-12-16T10:00:00Z') },
    { tenantId, sku: 'ESCR-001', type: 'OUT', qty: 2, reason: 'Pedido #ORD-a0000002', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-002', idempotencyKey: 'adj-seed-002', createdAt: new Date('2025-12-23T14:00:00Z') },
    { tenantId, sku: 'IND-001', type: 'ADJUSTMENT', qty: 5, reason: 'Inventário trimestral - ajuste', actorSub: 'admin@local', correlationId: 'corr-adj-003', idempotencyKey: 'adj-seed-003', createdAt: new Date('2025-12-28T09:00:00Z') },
    { tenantId, sku: 'SEG-001', type: 'IN', qty: 20, reason: 'Recebimento NF 12389', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-004', idempotencyKey: 'adj-seed-004', createdAt: new Date('2026-01-06T11:00:00Z') },
    { tenantId, sku: 'LIMP-001', type: 'OUT', qty: 1, reason: 'Pedido #ORD-a0000005', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-005', idempotencyKey: 'adj-seed-005', createdAt: new Date('2026-01-13T08:00:00Z') },
    { tenantId, sku: 'IND-003', type: 'OUT', qty: 1, reason: 'Pedido #ORD-a0000006', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-006', idempotencyKey: 'adj-seed-006', createdAt: new Date('2025-12-21T14:00:00Z') },
    { tenantId, sku: 'ELET-001', type: 'OUT', qty: 5, reason: 'Pedido #ORD-a0000009', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-007', idempotencyKey: 'adj-seed-007', createdAt: new Date('2026-02-04T08:00:00Z') },
    { tenantId, sku: 'ELET-004', type: 'OUT', qty: 10, reason: 'Pedido #ORD-a0000009', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-008', idempotencyKey: 'adj-seed-008', createdAt: new Date('2026-02-04T08:00:00Z') },
    { tenantId, sku: 'IND-005', type: 'IN', qty: 100, reason: 'Recebimento NF 12400', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-009', idempotencyKey: 'adj-seed-009', createdAt: new Date('2025-12-11T10:00:00Z') },
    { tenantId, sku: 'IND-004', type: 'ADJUSTMENT', qty: -2, reason: 'Inventário trimestral - ajuste', actorSub: 'admin@local', correlationId: 'corr-adj-010', idempotencyKey: 'adj-seed-010', createdAt: new Date('2025-12-30T09:00:00Z') },
    { tenantId: tenantId2, sku: 'LIMP-001', type: 'IN', qty: 10, reason: 'Recebimento NF 20001', actorSub: 'ops@acme.example.com', correlationId: 'corr-adj-011', idempotencyKey: 'adj-seed-011', createdAt: new Date('2026-01-10T10:00:00Z') },
    { tenantId: tenantId2, sku: 'LIMP-002', type: 'OUT', qty: 2, reason: 'Pedido #ORD-a0000005', actorSub: 'ops@acme.example.com', correlationId: 'corr-adj-012', idempotencyKey: 'adj-seed-012', createdAt: new Date('2026-01-13T09:00:00Z') },
    { tenantId, sku: 'ESCR-002', type: 'IN', qty: 5, reason: 'Recebimento NF 12410', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-013', idempotencyKey: 'adj-seed-013', createdAt: new Date('2026-01-03T11:00:00Z') },
    { tenantId, sku: 'ESCR-002', type: 'OUT', qty: 2, reason: 'Pedido #ORD-a0000007', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-014', idempotencyKey: 'adj-seed-014', createdAt: new Date('2026-01-05T11:00:00Z') },
    { tenantId: tenantId2, sku: 'ELET-002', type: 'OUT', qty: 3, reason: 'Pedido #ORD-a0000008', actorSub: 'ops@acme.example.com', correlationId: 'corr-adj-015', idempotencyKey: 'adj-seed-015', createdAt: new Date('2026-01-18T09:00:00Z') },
    { tenantId, sku: 'LIMP-004', type: 'IN', qty: 200, reason: 'Recebimento NF 12450', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-016', idempotencyKey: 'adj-seed-016', createdAt: new Date('2026-01-24T10:00:00Z') },
    { tenantId, sku: 'LIMP-004', type: 'OUT', qty: 20, reason: 'Pedido #ORD-a0000013', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-017', idempotencyKey: 'adj-seed-017', createdAt: new Date('2026-01-28T08:00:00Z') },
    { tenantId, sku: 'ESCR-003', type: 'IN', qty: 100, reason: 'Recebimento NF 12470', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-018', idempotencyKey: 'adj-seed-018', createdAt: new Date('2026-02-19T11:00:00Z') },
    { tenantId, sku: 'ESCR-003', type: 'OUT', qty: 50, reason: 'Pedido #ORD-a0000014', actorSub: 'ops@demo.example.com', correlationId: 'corr-adj-019', idempotencyKey: 'adj-seed-019', createdAt: new Date('2026-02-23T09:00:00Z') },
    { tenantId: tenantId2, sku: 'SEG-004', type: 'ADJUSTMENT', qty: 2, reason: 'Devolução cancelamento - Pedido #ORD-a0000015', actorSub: 'ops@acme.example.com', correlationId: 'corr-adj-020', idempotencyKey: 'adj-seed-020', createdAt: new Date('2026-03-06T14:00:00Z') },
  ];

  for (const adj of adjustmentDefs) {
    const existing = await prisma.inventoryAdjustment.findFirst({
      where: { idempotencyKey: adj.idempotencyKey },
    });
    if (!existing) {
      await prisma.inventoryAdjustment.create({
        data: {
          tenantId: adj.tenantId,
          sku: adj.sku,
          type: adj.type,
          qty: adj.qty,
          reason: adj.reason,
          actorSub: adj.actorSub,
          correlationId: adj.correlationId,
          idempotencyKey: adj.idempotencyKey,
          createdAt: adj.createdAt,
        },
      });
    }
  }

  // --- Feature Flags (3 for tenant_demo) ---
  await prisma.featureFlag.upsert({
    where: { tenantId_name: { tenantId, name: 'fast_checkout' } },
    update: { enabled: true, rolloutPercent: 100, allowedRoles: [] },
    create: { tenantId, name: 'fast_checkout', enabled: true, rolloutPercent: 100, allowedRoles: [] },
  });
  await prisma.featureFlag.upsert({
    where: { tenantId_name: { tenantId, name: 'ai_recommendations' } },
    update: { enabled: true, rolloutPercent: 50, allowedRoles: ['admin'] },
    create: { tenantId, name: 'ai_recommendations', enabled: true, rolloutPercent: 50, allowedRoles: ['admin'] },
  });
  await prisma.featureFlag.upsert({
    where: { tenantId_name: { tenantId, name: 'dark_theme' } },
    update: { enabled: true, rolloutPercent: 100, allowedRoles: [] },
    create: { tenantId, name: 'dark_theme', enabled: true, rolloutPercent: 100, allowedRoles: [] },
  });

  // --- Audit Log (20 entries) ---
  const auditDefs = [
    { tenantId, actorSub: 'ops@demo.example.com', action: 'ORDER_CREATED', target: 'a0000001-0000-4000-8000-000000000001', detail: { orderId: 'a0000001-0000-4000-8000-000000000001', customerId: 'cust-abc-001', totalAmount: 9799.80 }, correlationId: 'audit-001', createdAt: new Date('2025-12-15T09:01:00Z') },
    { tenantId, actorSub: 'ops@demo.example.com', action: 'ORDER_SHIPPED', target: 'a0000006-0000-4000-8000-000000000006', detail: { orderId: 'a0000006-0000-4000-8000-000000000006', trackingCode: 'BR123456789', carrier: 'Correios' }, correlationId: 'audit-002', createdAt: new Date('2025-12-20T14:05:00Z') },
    { tenantId, actorSub: 'admin@local', action: 'PRODUCT_UPDATED', target: 'ELET-001', detail: { sku: 'ELET-001', change: 'price_update', oldPrice: 4799.90, newPrice: 4899.90 }, correlationId: 'audit-003', createdAt: new Date('2025-12-18T10:00:00Z') },
    { tenantId, actorSub: 'ops@demo.example.com', action: 'INVENTORY_ADJUSTED', target: 'ELET-001', detail: { sku: 'ELET-001', type: 'IN', qty: 50, reason: 'Recebimento NF 12345' }, correlationId: 'audit-004', createdAt: new Date('2025-12-16T10:01:00Z') },
    { tenantId: null, actorSub: 'admin@local', action: 'LOGIN', target: 'admin@local', detail: { success: true, ip: '192.168.1.1' }, correlationId: 'audit-005', createdAt: new Date('2025-12-15T08:55:00Z') },
    { tenantId, actorSub: 'sales@demo.example.com', action: 'LOGIN', target: 'sales@demo.example.com', detail: { success: true, tenantId }, correlationId: 'audit-006', createdAt: new Date('2025-12-22T14:35:00Z') },
    { tenantId, actorSub: 'ops@demo.example.com', action: 'ORDER_CREATED', target: 'a0000002-0000-4000-8000-000000000002', detail: { orderId: 'a0000002-0000-4000-8000-000000000002', customerId: 'cust-xyz-001', totalAmount: 4648.50 }, correlationId: 'audit-007', createdAt: new Date('2025-12-22T14:31:00Z') },
    { tenantId, actorSub: 'ops@demo.example.com', action: 'ORDER_CONFIRMED', target: 'a0000003-0000-4000-8000-000000000003', detail: { orderId: 'a0000003-0000-4000-8000-000000000003' }, correlationId: 'audit-008', createdAt: new Date('2025-12-29T08:00:00Z') },
    { tenantId: tenantId2, actorSub: 'ops@acme.example.com', action: 'ORDER_SHIPPED', target: 'a0000008-0000-4000-8000-000000000008', detail: { orderId: 'a0000008-0000-4000-8000-000000000008', trackingCode: 'AZUL987654' }, correlationId: 'audit-009', createdAt: new Date('2026-01-17T09:05:00Z') },
    { tenantId, actorSub: 'admin@local', action: 'FEATURE_FLAG_UPDATED', target: 'fast_checkout', detail: { flag: 'fast_checkout', enabled: true, rolloutPercent: 100 }, correlationId: 'audit-010', createdAt: new Date('2026-01-02T09:00:00Z') },
    { tenantId, actorSub: 'ops@demo.example.com', action: 'ORDER_DELIVERED', target: 'a0000010-0000-4000-8000-000000000010', detail: { orderId: 'a0000010-0000-4000-8000-000000000010', deliveredAt: '2025-12-15T16:30:00Z' }, correlationId: 'audit-011', createdAt: new Date('2025-12-15T16:35:00Z') },
    { tenantId, actorSub: 'ops@demo.example.com', action: 'INVENTORY_ADJUSTED', target: 'IND-001', detail: { sku: 'IND-001', type: 'ADJUSTMENT', qty: 5 }, correlationId: 'audit-012', createdAt: new Date('2025-12-28T09:01:00Z') },
    { tenantId: tenantId2, actorSub: 'ops@acme.example.com', action: 'ORDER_CANCELLED', target: 'a0000015-0000-4000-8000-000000000015', detail: { orderId: 'a0000015-0000-4000-8000-000000000015', reason: 'Solicitação do cliente' }, correlationId: 'audit-013', createdAt: new Date('2026-03-06T10:00:00Z') },
    { tenantId, actorSub: 'ops@demo.example.com', action: 'ORDER_SHIPPED', target: 'a0000007-0000-4000-8000-000000000007', detail: { orderId: 'a0000007-0000-4000-8000-000000000007', trackingCode: 'JADEF123456' }, correlationId: 'audit-014', createdAt: new Date('2026-01-04T11:05:00Z') },
    { tenantId, actorSub: 'admin@local', action: 'PRODUCT_UPDATED', target: 'ESCR-002', detail: { sku: 'ESCR-002', change: 'stock_check' }, correlationId: 'audit-015', createdAt: new Date('2026-01-04T15:00:00Z') },
    { tenantId, actorSub: 'sales@demo.example.com', action: 'ORDER_CREATED', target: 'a0000009-0000-4000-8000-000000000009', detail: { orderId: 'a0000009-0000-4000-8000-000000000009', customerId: 'cust-tec-001' }, correlationId: 'audit-016', createdAt: new Date('2026-02-01T10:01:00Z') },
    { tenantId, actorSub: 'ops@demo.example.com', action: 'ORDER_DELIVERED', target: 'a0000014-0000-4000-8000-000000000014', detail: { orderId: 'a0000014-0000-4000-8000-000000000014' }, correlationId: 'audit-017', createdAt: new Date('2026-02-25T15:05:00Z') },
    { tenantId: tenantId2, actorSub: 'ops@acme.example.com', action: 'INVENTORY_ADJUSTED', target: 'LIMP-001', detail: { sku: 'LIMP-001', type: 'IN', qty: 10 }, correlationId: 'audit-018', createdAt: new Date('2026-01-10T10:01:00Z') },
    { tenantId, actorSub: 'admin@local', action: 'ACCESS_DENIED', target: 'admin:write', detail: { userId: 'sales@demo.example.com', permission: 'admin:write' }, correlationId: 'audit-019', createdAt: new Date('2026-02-10T11:00:00Z') },
    { tenantId, actorSub: 'ops@demo.example.com', action: 'LOGIN', target: 'ops@demo.example.com', detail: { success: true }, correlationId: 'audit-020', createdAt: new Date('2026-03-12T09:00:00Z') },
  ];

  for (const a of auditDefs) {
    const existing = await prisma.auditLog.findFirst({
      where: { correlationId: a.correlationId },
    });
    if (!existing) {
      await prisma.auditLog.create({
        data: {
          tenantId: a.tenantId,
          actorSub: a.actorSub,
          action: a.action,
          target: a.target,
          detail: a.detail,
          correlationId: a.correlationId,
          createdAt: a.createdAt,
        },
      });
    }
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
