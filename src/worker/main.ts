import * as amqp from 'amqplib';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { Counter } from 'prom-client';
import CircuitBreaker from 'opossum';

import { createCircuitBreaker } from '../infrastructure/circuit-breaker/circuit-breaker.factory';
import { log } from '../shared/logging/logger';

const HEARTBEAT_FILE = path.join(process.env.HEARTBEAT_DIR || '/tmp', 'worker-heartbeat');

const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || '90');
const AUDIT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

const EXCHANGE = process.env.ORDERS_EXCHANGE || 'orders.x';
const QUEUE = process.env.ORDERS_QUEUE || 'orders.events';
const DLQ = process.env.ORDERS_DLQ || 'orders.dlq';

const PAYMENTS_EXCHANGE = process.env.PAYMENTS_EXCHANGE || 'payments.x';
const PAYMENTS_QUEUE = process.env.PAYMENTS_INBOUND_QUEUE || 'orders.payments';
const PAYMENTS_DLQ = process.env.PAYMENTS_DLQ || 'orders.payments.dlq';

interface OrderEventBody {
  orderId: string;
  tenantId: string;
  correlationId?: string;
  totalAmount?: number;
  customerId?: string;
  items?: Array<{ sku: string; qty: number; price: number | string }>;
  currency?: string;
  trackingCode?: string;
}

interface PaymentEventBody {
  orderId?: string;
  order_id?: string;
  tenantId?: string;
  tenant_id?: string;
  correlationId?: string;
  correlation_id?: string;
  [key: string]: unknown;
}

const DEDUP_TTL_SECONDS = 86_400; // 24h

export async function isAlreadyProcessed(redis: Redis, eventType: string, eventId: string): Promise<boolean> {
  const key = `processed:${eventType}:${eventId}`;
  const result = await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
  return result === null; // NX returns null if key already existed
}

const inventoryReserved = new Counter({
  name: 'inventory_reserved_total',
  help: 'Total inventory reservation events (worker)',
  labelNames: ['tenant_id'],
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

      const evPayload = ev.payload as Record<string, unknown>;
      const payload = {
        ...evPayload,
        tenantId: ev.tenantId,
        correlationId: (evPayload.correlationId as string) || '',
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

export async function cleanupOldAuditLogs(prisma: PrismaClient): Promise<void> {
  if (AUDIT_RETENTION_DAYS <= 0) return;

  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      log('audit.retention_cleanup', { deleted: result.count, cutoff: cutoff.toISOString() });
    }
  } catch (err) {
    log('audit.retention_cleanup_failed', { error: String(err) });
  }
}

export async function handleOrderMessage(prisma: PrismaClient, routingKey: string, body: OrderEventBody) {
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
        const updated = await tx.inventoryItem.update({
          where: { tenantId_sku: { tenantId, sku: item.sku } },
          data: { availableQty: { decrement: item.qty }, reservedQty: { increment: item.qty } },
        });
        if (updated.availableQty <= 0) {
          await tx.product.updateMany({
            where: { tenantId, sku: item.sku, active: true },
            data: { inStock: false },
          });
        }
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
          const updated = await tx.inventoryItem.update({
            where: { tenantId_sku: { tenantId, sku: item.sku } },
            data: { availableQty: { increment: item.qty }, reservedQty: { decrement: item.qty } },
          });
          if (updated.availableQty > 0) {
            await tx.product.updateMany({
              where: { tenantId, sku: item.sku, active: true, inStock: false },
              data: { inStock: true },
            });
          }
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
        order.items.reduce((s, i) => s + Number(i.price) * i.qty, 0);
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
            items: (body.items ?? order.items).map((i) => ({
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
    return;
  }

  if (routingKey === 'order.shipped') {
    log('order.shipped', { orderId, tenantId, correlationId, trackingCode: body.trackingCode });
    return;
  }

  if (routingKey === 'order.delivered') {
    log('order.delivered', { orderId, tenantId, correlationId });
    return;
  }
}

export async function handlePaymentMessage(prisma: PrismaClient, routingKey: string, body: PaymentEventBody) {
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

let shutdownRequested = false;
let activeConnection: amqp.ChannelModel | null = null;
let activeChannels: amqp.Channel[] = [];
let activePrisma: PrismaClient | null = null;
let activeRedis: Redis | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let auditCleanupInterval: ReturnType<typeof setInterval> | null = null;

function writeHeartbeat() {
  try {
    fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString(), 'utf8');
  } catch { /* ignore */ }
}

async function gracefulShutdown(signal: string) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  log('worker.shutting_down', { signal });

  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (auditCleanupInterval) clearInterval(auditCleanupInterval);
  try { fs.unlinkSync(HEARTBEAT_FILE); } catch { /* ignore */ }

  for (const ch of activeChannels) {
    try { await ch.close(); } catch { /* ignore */ }
  }
  activeChannels = [];

  if (activeConnection) {
    try { await activeConnection.close(); } catch { /* ignore */ }
    activeConnection = null;
  }
  if (activePrisma) {
    try { await activePrisma.$disconnect(); } catch { /* ignore */ }
    activePrisma = null;
  }
  if (activeRedis) {
    try { await activeRedis.quit(); } catch { /* ignore */ }
    activeRedis = null;
  }

  log('worker.shutdown_complete', { signal });
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

async function connectRabbitMQ(rabbitUrl: string): Promise<amqp.ChannelModel> {
  const MAX_RETRIES = 10;
  let attempt = 0;

  while (!shutdownRequested) {
    try {
      attempt++;
      const conn = await amqp.connect(rabbitUrl);

      conn.on('error', (err) => {
        log('rabbitmq.connection_error', { error: String(err) });
      });
      conn.on('close', () => {
        if (shutdownRequested) return;
        log('rabbitmq.connection_closed_unexpectedly');
        activeConnection = null;
        reconnect(rabbitUrl);
      });

      attempt = 0;
      return conn;
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        log('rabbitmq.max_retries_exceeded', { attempts: attempt });
        throw err;
      }
      const backoffMs = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 14));
      log('rabbitmq.connect_retry', { attempt, backoffMs, error: String(err) });
      await sleep(backoffMs);
    }
  }

  throw new Error('Shutdown requested during RabbitMQ connect');
}

async function reconnect(rabbitUrl: string) {
  if (shutdownRequested) return;
  log('rabbitmq.reconnecting');

  try {
    const conn = await connectRabbitMQ(rabbitUrl);
    activeConnection = conn;
    await setupChannelsAndConsumers(conn);
    log('rabbitmq.reconnected');
  } catch (err) {
    log('rabbitmq.reconnect_failed', { error: String(err) });
    if (!shutdownRequested) process.exit(1);
  }
}

async function setupChannelsAndConsumers(conn: amqp.ChannelModel) {
  const workerId = process.env.HOSTNAME || `worker-${uuidv4().slice(0, 8)}`;

  const chDispatch = await conn.createChannel();
  const chConsume = await conn.createChannel();
  const chPayments = await conn.createChannel();
  activeChannels = [chDispatch, chConsume, chPayments];

  await ensureOrdersTopology(chDispatch);
  await ensureOrdersTopology(chConsume);
  await ensurePaymentsTopology(chDispatch);
  await ensurePaymentsTopology(chPayments);

  dispatchOutbox(activePrisma!, chDispatch, workerId).catch((e) =>
    log('dispatchOutbox.fatal', { error: String(e) })
  );

  await chConsume.prefetch(10);
  await chConsume.consume(
    QUEUE,
    async (msg: amqp.ConsumeMessage | null) => {
      if (!msg) return;
      const routingKey = msg.fields.routingKey;
      try {
        const body: OrderEventBody = JSON.parse(msg.content.toString('utf8'));
        const eventId = body.orderId || msg.properties.messageId || String(msg.fields.deliveryTag);
        if (activeRedis && await isAlreadyProcessed(activeRedis, routingKey, String(eventId))) {
          log('dedup.skipped', { routingKey, eventId });
          chConsume.ack(msg);
          return;
        }
        await handleOrderMessage(activePrisma!, routingKey, body);
        chConsume.ack(msg);
      } catch (e) {
        log('handler.error', { routingKey: msg.fields.routingKey, error: String(e) });
        chConsume.reject(msg, false);
      }
    },
    { noAck: false },
  );

  await chPayments.prefetch(10);
  await chPayments.consume(
    PAYMENTS_QUEUE,
    async (msg: amqp.ConsumeMessage | null) => {
      if (!msg) return;
      const routingKey = msg.fields.routingKey;
      try {
        const body: PaymentEventBody = JSON.parse(msg.content.toString('utf8'));
        const eventId = body.orderId || body.order_id || msg.properties.messageId || String(msg.fields.deliveryTag);
        if (activeRedis && await isAlreadyProcessed(activeRedis, routingKey, String(eventId))) {
          log('dedup.skipped', { routingKey, eventId });
          chPayments.ack(msg);
          return;
        }
        await handlePaymentMessage(activePrisma!, routingKey, body);
        chPayments.ack(msg);
      } catch (e) {
        log('payment_handler.error', { routingKey: msg.fields.routingKey, error: String(e) });
        chPayments.reject(msg, false);
      }
    },
    { noAck: false },
  );
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.RABBITMQ_URL) {
      throw new Error('RABBITMQ_URL environment variable is required in production');
    }
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is required in production');
    }
  }

  const prisma = new PrismaClient();
  activePrisma = prisma;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  activeRedis = new Redis(redisUrl, { lazyConnect: true });
  await activeRedis.connect();

  const workerId = process.env.HOSTNAME || `worker-${uuidv4().slice(0, 8)}`;
  const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

  log('worker.starting', { workerId, rabbitUrl: rabbitUrl.replace(/\/\/.*@/, '//***@') });

  const conn = await connectRabbitMQ(rabbitUrl);
  activeConnection = conn;

  await setupChannelsAndConsumers(conn);

  writeHeartbeat();
  heartbeatInterval = setInterval(writeHeartbeat, 10_000);

  if (AUDIT_RETENTION_DAYS > 0) {
    cleanupOldAuditLogs(prisma).catch((e) => log('audit.retention_first_run_failed', { error: String(e) }));
    auditCleanupInterval = setInterval(() => {
      cleanupOldAuditLogs(prisma).catch((e) => log('audit.retention_cleanup_failed', { error: String(e) }));
    }, AUDIT_CLEANUP_INTERVAL_MS);
    log('audit.retention_scheduled', { retentionDays: AUDIT_RETENTION_DAYS });
  }

  log('worker.started', { workerId });
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
