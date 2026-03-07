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
  ];
  for (const code of perms) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }

  const roleMap: Record<string, string[]> = {
    admin: perms,
    ops: ['orders:write', 'orders:read', 'inventory:read', 'inventory:write', 'products:read', 'products:write', 'profile:read'],
    sales: ['orders:read', 'inventory:read', 'products:read', 'profile:read'],
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
    {
      permissionCode: 'orders:write',
      allowedPlans: ['pro', 'enterprise'],
      allowedRegions: ['region-a', 'region-b'],
    },
    {
      permissionCode: 'orders:read',
      allowedPlans: ['free', 'pro', 'enterprise'],
      allowedRegions: ['region-a', 'region-b'],
    },
    {
      permissionCode: 'inventory:read',
      allowedPlans: ['free', 'pro', 'enterprise'],
      allowedRegions: ['region-a', 'region-b'],
    },
    {
      permissionCode: 'inventory:write',
      allowedPlans: ['pro', 'enterprise'],
      allowedRegions: ['region-a', 'region-b'],
    },
    {
      permissionCode: 'products:read',
      allowedPlans: ['free', 'pro', 'enterprise'],
      allowedRegions: ['region-a', 'region-b'],
    },
    {
      permissionCode: 'products:write',
      allowedPlans: ['pro', 'enterprise'],
      allowedRegions: ['region-a', 'region-b'],
    },
    {
      permissionCode: 'admin:write',
      allowedPlans: ['enterprise'],
      allowedRegions: ['region-a', 'region-b'],
    },
    {
      permissionCode: 'profile:read',
      allowedPlans: ['free', 'pro', 'enterprise'],
      allowedRegions: ['region-a', 'region-b'],
    },
  ];

  for (const p of policies) {
    await prisma.policy.upsert({
      where: { permissionCode: p.permissionCode },
      update: { effect: 'allow', allowedPlans: p.allowedPlans, allowedRegions: p.allowedRegions },
      create: {
        permissionCode: p.permissionCode,
        effect: 'allow',
        allowedPlans: p.allowedPlans,
        allowedRegions: p.allowedRegions,
      },
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

  const products = [
    { sku: 'ELET-001', name: 'Notebook Corporativo 15"', price: 4899.90, category: 'Eletrônicos', description: 'Notebook profissional com 16GB RAM, SSD 512GB, tela IPS Full HD', rating: 4.5, reviewCount: 128, imageUrl: 'https://picsum.photos/seed/elet001/400/300', currency: 'BRL' },
    { sku: 'ELET-002', name: 'Monitor Ultrawide 34"', price: 3299.00, category: 'Eletrônicos', description: 'Monitor curvo 34 polegadas UWQHD, ideal para produtividade', rating: 4.7, reviewCount: 85, imageUrl: 'https://picsum.photos/seed/elet002/400/300', currency: 'BRL' },
    { sku: 'ELET-003', name: 'Teclado Mecânico Sem Fio', price: 489.90, category: 'Eletrônicos', description: 'Teclado mecânico Bluetooth/USB-C, switches silenciosos', rating: 4.3, reviewCount: 214, imageUrl: 'https://picsum.photos/seed/elet003/400/300', currency: 'BRL' },
    { sku: 'ELET-004', name: 'Mouse Ergonômico Vertical', price: 259.90, category: 'Eletrônicos', description: 'Mouse vertical wireless com 6 botões programáveis', rating: 4.1, reviewCount: 167, imageUrl: 'https://picsum.photos/seed/elet004/400/300', currency: 'BRL' },
    { sku: 'ELET-005', name: 'Webcam Full HD com Microfone', price: 349.90, category: 'Eletrônicos', description: 'Webcam 1080p com autofoco e cancelamento de ruído', rating: 4.0, reviewCount: 92, imageUrl: 'https://picsum.photos/seed/elet005/400/300', currency: 'BRL' },
    { sku: 'ESCR-001', name: 'Cadeira Executiva Premium', price: 2199.00, category: 'Escritório', description: 'Cadeira ergonômica com apoio lombar ajustável e braços 4D', rating: 4.6, reviewCount: 301, imageUrl: 'https://picsum.photos/seed/escr001/400/300', currency: 'BRL' },
    { sku: 'ESCR-002', name: 'Mesa Elevatória 160cm', price: 3499.00, category: 'Escritório', description: 'Mesa sit-stand elétrica com memória de posições, tampo MDP', rating: 4.8, reviewCount: 56, imageUrl: 'https://picsum.photos/seed/escr002/400/300', currency: 'BRL' },
    { sku: 'ESCR-003', name: 'Organizador de Cabos Kit', price: 79.90, category: 'Escritório', description: 'Kit com 20 presilhas, 2 canaletas e 5 etiquetas para organização', rating: 3.9, reviewCount: 420, imageUrl: 'https://picsum.photos/seed/escr003/400/300', currency: 'BRL' },
    { sku: 'ESCR-004', name: 'Luminária LED de Mesa', price: 189.90, category: 'Escritório', description: 'Luminária LED com 5 níveis de brilho e temperatura de cor ajustável', rating: 4.4, reviewCount: 178, imageUrl: 'https://picsum.photos/seed/escr004/400/300', currency: 'BRL' },
    { sku: 'ESCR-005', name: 'Apoio para Pés Ajustável', price: 149.90, category: 'Escritório', description: 'Apoio ergonômico com inclinação regulável e superfície antiderrapante', rating: 4.2, reviewCount: 95, imageUrl: 'https://picsum.photos/seed/escr005/400/300', currency: 'BRL' },
    { sku: 'IND-001', name: 'Compressor de Ar 50L', price: 1899.00, category: 'Industrial', description: 'Compressor industrial 2HP, tanque 50 litros, pressão máx 120 PSI', rating: 4.3, reviewCount: 44, imageUrl: 'https://picsum.photos/seed/ind001/400/300', currency: 'BRL' },
    { sku: 'IND-002', name: 'Furadeira de Coluna', price: 2799.00, category: 'Industrial', description: 'Furadeira de bancada 16mm com motor 750W e mesa inclinável', rating: 4.5, reviewCount: 32, imageUrl: 'https://picsum.photos/seed/ind002/400/300', currency: 'BRL' },
    { sku: 'IND-003', name: 'Empilhadeira Manual 2T', price: 4599.00, category: 'Industrial', description: 'Empilhadeira hidráulica manual, capacidade 2000kg, garfos 1150mm', rating: 4.7, reviewCount: 18, imageUrl: 'https://picsum.photos/seed/ind003/400/300', currency: 'BRL' },
    { sku: 'IND-004', name: 'Estante Industrial 5 Níveis', price: 689.90, category: 'Industrial', description: 'Estante metálica 200x100x50cm, capacidade 350kg por prateleira', rating: 4.1, reviewCount: 76, imageUrl: 'https://picsum.photos/seed/ind004/400/300', currency: 'BRL' },
    { sku: 'IND-005', name: 'Caixa de Ferramentas Profissional', price: 459.90, category: 'Industrial', description: 'Caixa sanfonada com 5 gavetas, 65 peças incluídas', rating: 4.4, reviewCount: 112, imageUrl: 'https://picsum.photos/seed/ind005/400/300', currency: 'BRL' },
    { sku: 'SEG-001', name: 'Câmera IP PoE 4MP', price: 599.90, category: 'Segurança', description: 'Câmera bullet com visão noturna 30m, IP67, detecção de movimento', rating: 4.6, reviewCount: 203, imageUrl: 'https://picsum.photos/seed/seg001/400/300', currency: 'BRL' },
    { sku: 'SEG-002', name: 'Controle de Acesso Biométrico', price: 1299.00, category: 'Segurança', description: 'Leitor biométrico com facial e digital, capacidade 3000 usuários', rating: 4.2, reviewCount: 67, imageUrl: 'https://picsum.photos/seed/seg002/400/300', currency: 'BRL' },
    { sku: 'SEG-003', name: 'Fechadura Digital Smart', price: 899.90, category: 'Segurança', description: 'Fechadura com senha, cartão RFID, biometria e app mobile', rating: 4.0, reviewCount: 145, imageUrl: 'https://picsum.photos/seed/seg003/400/300', currency: 'BRL' },
    { sku: 'SEG-004', name: 'Cofre Digital 50L', price: 1599.00, category: 'Segurança', description: 'Cofre eletrônico com teclado e chave de emergência, anti-arrombamento', rating: 4.5, reviewCount: 38, imageUrl: 'https://picsum.photos/seed/seg004/400/300', currency: 'BRL' },
    { sku: 'SEG-005', name: 'Kit Alarme Empresarial', price: 2199.00, category: 'Segurança', description: 'Central de alarme com 8 zonas, 4 sensores IR e 2 controles', rating: 4.3, reviewCount: 54, imageUrl: 'https://picsum.photos/seed/seg005/400/300', currency: 'BRL' },
    { sku: 'LIMP-001', name: 'Lavadora de Alta Pressão Industrial', price: 3299.00, category: 'Limpeza', description: 'Lavadora 2500 PSI com motor de indução, uso contínuo', rating: 4.7, reviewCount: 89, imageUrl: 'https://picsum.photos/seed/limp001/400/300', currency: 'BRL' },
    { sku: 'LIMP-002', name: 'Aspirador Industrial 80L', price: 2499.00, category: 'Limpeza', description: 'Aspirador sólidos e líquidos 80L com 2 motores, 2400W', rating: 4.4, reviewCount: 61, imageUrl: 'https://picsum.photos/seed/limp002/400/300', currency: 'BRL' },
    { sku: 'LIMP-003', name: 'Enceradeira Industrial 510mm', price: 1899.00, category: 'Limpeza', description: 'Enceradeira com disco de 510mm para grandes áreas', rating: 4.1, reviewCount: 27, imageUrl: 'https://picsum.photos/seed/limp003/400/300', currency: 'BRL' },
    { sku: 'LIMP-004', name: 'Dispensador de Papel Toalha', price: 129.90, category: 'Limpeza', description: 'Dispensador em ABS para papel interfolhado, fixação parede', rating: 3.8, reviewCount: 312, imageUrl: 'https://picsum.photos/seed/limp004/400/300', currency: 'BRL' },
    { sku: 'LIMP-005', name: 'Kit Limpeza Profissional', price: 349.90, category: 'Limpeza', description: 'Balde espremedor, mop profissional, rodo 60cm e pulverizador 2L', rating: 4.2, reviewCount: 198, imageUrl: 'https://picsum.photos/seed/limp005/400/300', currency: 'BRL' },
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
