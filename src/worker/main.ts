import * as amqp from 'amqplib';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const EXCHANGE = 'orders.x';
const QUEUE = 'orders.events';
const DLQ = 'orders.dlq';

type AnyJson = any;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureTopology(ch: amqp.Channel) {
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(DLQ, { durable: true });
  await ch.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': DLQ,
    },
  });
  await ch.bindQueue(QUEUE, EXCHANGE, '#');
}

async function dispatchOutbox(prisma: PrismaClient, ch: amqp.Channel, workerId: string) {
  while (true) {
    const now = new Date();
    const stale = new Date(Date.now() - 60_000);

    const batch = await prisma.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        availableAt: { lte: now },
        OR: [{ lockedAt: null }, { lockedAt: { lt: stale } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const ev of batch) {
      const claimed = await prisma.outboxEvent.updateMany({
        where: { id: ev.id, lockedAt: ev.lockedAt },
        data: { lockedAt: now, lockedBy: workerId },
      });
      if (claimed.count === 0) continue;

      const payload = { ...(ev.payload as AnyJson), tenantId: ev.tenantId, correlationId: (ev.payload as AnyJson)?.correlationId || '' };
      const headers = { 'X-Correlation-Id': payload.correlationId || '', 'X-Tenant-Id': ev.tenantId };

      try {
        ch.publish(EXCHANGE, ev.eventType, Buffer.from(JSON.stringify(payload)), {
          contentType: 'application/json',
          persistent: true,
          headers,
          timestamp: Math.floor(Date.now() / 1000),
        });
        await prisma.outboxEvent.update({ where: { id: ev.id }, data: { status: 'SENT', lockedAt: null, lockedBy: null } });
      } catch (e) {
        const attempts = ev.attempts + 1;
        const backoffSeconds = Math.min(60, 2 ** Math.min(6, attempts));
        const availableAt = new Date(Date.now() + backoffSeconds * 1000);
        await prisma.outboxEvent.update({
          where: { id: ev.id },
          data: { attempts, lockedAt: null, lockedBy: null, availableAt, status: attempts >= 7 ? 'DEAD' : 'PENDING' },
        });
      }
    }

    await sleep(1000);
  }
}

async function handleMessage(prisma: PrismaClient, routingKey: string, body: AnyJson) {
  if (routingKey === 'order.created') {
    const orderId = body.orderId as string;
    const tenantId = body.tenantId as string;
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { items: true } });
    if (!order) return;

    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const inv = await tx.inventoryItem.findUnique({ where: { tenantId_sku: { tenantId, sku: item.sku } } });
        if (!inv || inv.availableQty < item.qty) {
          await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
          await tx.outboxEvent.create({
            data: { tenantId, eventType: 'order.cancelled', aggregateType: 'Order', aggregateId: orderId, payload: { orderId, tenantId, correlationId: body.correlationId || '' } },
          });
          return;
        }
      }

      for (const item of order.items) {
        await tx.inventoryItem.update({
          where: { tenantId_sku: { tenantId, sku: item.sku } },
          data: { availableQty: { decrement: item.qty }, reservedQty: { increment: item.qty } },
        });
      }

      await tx.order.update({ where: { id: orderId }, data: { status: 'RESERVED' } });
      await tx.outboxEvent.create({
        data: { tenantId, eventType: 'stock.reserved', aggregateType: 'Order', aggregateId: orderId, payload: { orderId, tenantId, correlationId: body.correlationId || '' } },
      });
    });

    return;
  }

  if (routingKey === 'order.cancelled') {
    const orderId = body.orderId as string;
    const tenantId = body.tenantId as string;
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { items: true } });
    if (!order) return;

    await prisma.$transaction(async (tx) => {
      if (order.status === 'RESERVED') {
        for (const item of order.items) {
          await tx.inventoryItem.update({
            where: { tenantId_sku: { tenantId, sku: item.sku } },
            data: { availableQty: { increment: item.qty }, reservedQty: { decrement: item.qty } },
          });
        }
      }
      await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    });
    return;
  }

  if (routingKey === 'order.confirmed') {
    const orderId = body.orderId as string;
    const tenantId = body.tenantId as string;
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { items: true } });
    if (!order) return;

    await prisma.$transaction(async (tx) => {
      if (order.status === 'RESERVED') {
        for (const item of order.items) {
          await tx.inventoryItem.update({
            where: { tenantId_sku: { tenantId, sku: item.sku } },
            data: { reservedQty: { decrement: item.qty } },
          });
        }
      }
      await tx.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
    });
  }
}

async function main() {
  const prisma = new PrismaClient();
  const workerId = process.env.HOSTNAME || `worker-${uuidv4().slice(0, 8)}`;

  const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672');
  const chDispatch = await conn.createChannel();
  const chConsume = await conn.createChannel();

  await ensureTopology(chDispatch);
  await ensureTopology(chConsume);

  dispatchOutbox(prisma, chDispatch, workerId).catch((e) => console.error('dispatchOutbox', e));

  await chConsume.prefetch(10);
  await chConsume.consume(
    QUEUE,
    async (msg: any) => {
      if (!msg) return;
      const routingKey = msg.fields.routingKey;
      try {
        const body = JSON.parse(msg.content.toString('utf8'));
        await handleMessage(prisma, routingKey, body);
        chConsume.ack(msg);
      } catch (e) {
        console.error('handler error', e);
        chConsume.reject(msg, false);
      }
    },
    { noAck: false },
  );

  console.log(`worker started: ${workerId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
