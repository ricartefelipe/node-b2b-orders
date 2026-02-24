import * as amqp from 'amqplib';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Counter } from 'prom-client';
import CircuitBreaker from 'opossum';

import { createCircuitBreaker } from '../infrastructure/circuit-breaker/circuit-breaker.factory';

const EXCHANGE = process.env.ORDERS_EXCHANGE || 'orders.x';
const QUEUE = process.env.ORDERS_QUEUE || 'orders.events';
const DLQ = process.env.ORDERS_DLQ || 'orders.dlq';

const PAYMENTS_EXCHANGE = process.env.PAYMENTS_EXCHANGE || 'payments.x';
const PAYMENTS_QUEUE = process.env.PAYMENTS_INBOUND_QUEUE || 'orders.payments';
const PAYMENTS_DLQ = process.env.PAYMENTS_DLQ || 'orders.payments.dlq';

type AnyJson = any;

const inventoryReserved = new Counter({
  name: 'inventory_reserved_total',
  help: 'Total inventory reservation events (worker)',
  labelNames: ['tenant_id'],
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string, extra?: Record<string, unknown>) {
  const entry: Record<string, unknown> = { ts: new Date().toISOString(), msg, ...extra };
  console.log(JSON.stringify(entry));
}

async function ensureOrdersTopology(ch: amqp.Channel) {
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

async function ensurePaymentsTopology(ch: amqp.Channel) {
  await ch.assertExchange(PAYMENTS_EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(PAYMENTS_DLQ, { durable: true });
  await ch.assertQueue(PAYMENTS_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': PAYMENTS_DLQ,
    },
  });
  await ch.bindQueue(PAYMENTS_QUEUE, PAYMENTS_EXCHANGE, 'payment.settled');
}

function buildPublishBreaker(ch: amqp.Channel): CircuitBreaker<[string, string, Buffer, amqp.Options.Publish], boolean> {
  return createCircuitBreaker(
    'rabbitmq-publish',
    async (exchange: string, routingKey: string, content: Buffer, options: amqp.Options.Publish) => {
      return ch.publish(exchange, routingKey, content, options);
    },
    {
      timeout: 5_000,
      errorThresholdPercentage: 50,
      resetTimeout: 30_000,
      volumeThreshold: 5,
    },
  );
}

async function dispatchOutbox(prisma: PrismaClient, ch: amqp.Channel, workerId: string) {
  const publishBreaker = buildPublishBreaker(ch);

  publishBreaker.on('open', () => log('circuit.open', { breaker: 'rabbitmq-publish' }));
  publishBreaker.on('halfOpen', () => log('circuit.halfOpen', { breaker: 'rabbitmq-publish' }));
  publishBreaker.on('close', () => log('circuit.closed', { breaker: 'rabbitmq-publish' }));

  while (true) {
    if (publishBreaker.opened) {
      log('outbox.skipped_circuit_open');
      await sleep(5_000);
      continue;
    }

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

      const payload = {
        ...(ev.payload as AnyJson),
        tenantId: ev.tenantId,
        correlationId: (ev.payload as AnyJson)?.correlationId || '',
      };
      const headers = {
        'X-Correlation-Id': payload.correlationId || '',
        'X-Tenant-Id': ev.tenantId,
      };

      const targetExchange = ev.eventType.startsWith('payment.') ? PAYMENTS_EXCHANGE : EXCHANGE;

      try {
        await publishBreaker.fire(
          targetExchange,
          ev.eventType,
          Buffer.from(JSON.stringify(payload)),
          {
            contentType: 'application/json',
            persistent: true,
            headers,
            timestamp: Math.floor(Date.now() / 1000),
          },
        );
        await prisma.outboxEvent.update({
          where: { id: ev.id },
          data: { status: 'SENT', lockedAt: null, lockedBy: null },
        });
        log('outbox.dispatched', {
          eventType: ev.eventType,
          aggregateId: ev.aggregateId,
          tenantId: ev.tenantId,
        });
      } catch (e) {
        const attempts = ev.attempts + 1;
        const backoffSeconds = Math.min(60, 2 ** Math.min(6, attempts));
        const availableAt = new Date(Date.now() + backoffSeconds * 1000);
        await prisma.outboxEvent.update({
          where: { id: ev.id },
          data: {
            attempts,
            lockedAt: null,
            lockedBy: null,
            availableAt,
            status: attempts >= 7 ? 'DEAD' : 'PENDING',
          },
        });
        log('outbox.dispatch_failed', { eventType: ev.eventType, attempts, error: String(e) });
      }
    }

    await sleep(1_000);
  }
}

async function handleOrderMessage(prisma: PrismaClient, routingKey: string, body: AnyJson) {
  const orderId = body.orderId as string;
  const tenantId = body.tenantId as string;
  const correlationId = body.correlationId || '';

  if (routingKey === 'order.created') {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) return;

    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const inv = await tx.inventoryItem.findUnique({
          where: { tenantId_sku: { tenantId, sku: item.sku } },
        });
        if (!inv || inv.availableQty < item.qty) {
          await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
          await tx.outboxEvent.create({
            data: {
              tenantId,
              eventType: 'order.cancelled',
              aggregateType: 'Order',
              aggregateId: orderId,
              payload: { orderId, tenantId, correlationId },
            },
          });
          log('order.cancelled_insufficient_stock', { orderId, tenantId, correlationId });
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
        data: {
          tenantId,
          eventType: 'stock.reserved',
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: { orderId, tenantId, correlationId },
        },
      });
    });

    inventoryReserved.inc({ tenant_id: tenantId });
    log('order.reserved', { orderId, tenantId, correlationId });
    return;
  }

  if (routingKey === 'order.cancelled') {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
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

    log('order.cancelled', { orderId, tenantId, correlationId });
    return;
  }

  if (routingKey === 'order.confirmed') {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
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

      const totalAmount =
        body.totalAmount ||
        order.items.reduce((s: number, i: any) => s + Number(i.price) * i.qty, 0);
      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'payment.charge_requested',
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: {
            orderId,
            tenantId,
            correlationId,
            customerId: body.customerId || order.customerId,
            items: (body.items || order.items).map((i: any) => ({
              sku: i.sku,
              qty: i.qty,
              price: Number(i.price),
            })),
            totalAmount,
            currency: body.currency || 'BRL',
          },
        },
      });
    });

    log('order.confirmed_and_charge_requested', { orderId, tenantId, correlationId });
  }
}

async function handlePaymentMessage(prisma: PrismaClient, routingKey: string, body: AnyJson) {
  if (routingKey === 'payment.settled') {
    const orderId = body.orderId || body.order_id;
    const tenantId = body.tenantId || body.tenant_id;

    if (!orderId || !tenantId) {
      log('payment.settled_missing_fields', { body });
      return;
    }

    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) {
      log('payment.settled_order_not_found', { orderId, tenantId });
      return;
    }

    if (order.status !== 'CONFIRMED') {
      log('payment.settled_invalid_status', { orderId, tenantId, status: order.status });
      return;
    }

    await prisma.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
    log('order.paid', {
      orderId,
      tenantId,
      correlationId: body.correlationId || body.correlation_id || '',
    });
  }
}

async function main() {
  const prisma = new PrismaClient();
  const workerId = process.env.HOSTNAME || `worker-${uuidv4().slice(0, 8)}`;
  const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

  log('worker.starting', { workerId, rabbitUrl: rabbitUrl.replace(/\/\/.*@/, '//***@') });

  const conn = await amqp.connect(rabbitUrl);
  const chDispatch = await conn.createChannel();
  const chConsume = await conn.createChannel();
  const chPayments = await conn.createChannel();

  await ensureOrdersTopology(chDispatch);
  await ensureOrdersTopology(chConsume);
  await ensurePaymentsTopology(chDispatch);
  await ensurePaymentsTopology(chPayments);

  dispatchOutbox(prisma, chDispatch, workerId).catch((e) =>
    log('dispatchOutbox.fatal', { error: String(e) })
  );

  await chConsume.prefetch(10);
  await chConsume.consume(
    QUEUE,
    async (msg: any) => {
      if (!msg) return;
      const routingKey = msg.fields.routingKey;
      try {
        const body = JSON.parse(msg.content.toString('utf8'));
        await handleOrderMessage(prisma, routingKey, body);
        chConsume.ack(msg);
      } catch (e) {
        log('handler.error', { routingKey: msg.fields.routingKey, error: String(e) });
        chConsume.reject(msg, false);
      }
    },
    { noAck: false }
  );

  await chPayments.prefetch(10);
  await chPayments.consume(
    PAYMENTS_QUEUE,
    async (msg: any) => {
      if (!msg) return;
      const routingKey = msg.fields.routingKey;
      try {
        const body = JSON.parse(msg.content.toString('utf8'));
        await handlePaymentMessage(prisma, routingKey, body);
        chPayments.ack(msg);
      } catch (e) {
        log('payment_handler.error', { routingKey: msg.fields.routingKey, error: String(e) });
        chPayments.reject(msg, false);
      }
    },
    { noAck: false }
  );

  log('worker.started', { workerId });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
