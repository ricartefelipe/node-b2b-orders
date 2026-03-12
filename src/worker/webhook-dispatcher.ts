import { PrismaClient } from '@prisma/client';
import { createHmac } from 'crypto';

const MAX_ATTEMPTS = 5;
const DELIVERY_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 5_000;

function log(msg: string, extra?: Record<string, unknown>) {
  const entry: Record<string, unknown> = { ts: new Date().toISOString(), msg, ...extra };
  console.log(JSON.stringify(entry));
}

export async function enqueueWebhookDelivery(
  prisma: PrismaClient,
  eventType: string,
  payload: Record<string, unknown>,
  tenantId: string,
): Promise<number> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId, active: true, events: { has: eventType } },
  });

  if (endpoints.length === 0) return 0;

  await prisma.webhookDelivery.createMany({
    data: endpoints.map((ep) => ({
      endpointId: ep.id,
      eventType,
      payload: payload as any,
    })),
  });

  log('webhook.enqueued', { eventType, tenantId, count: endpoints.length });
  return endpoints.length;
}

export async function processWebhookDeliveries(
  prisma: PrismaClient,
  shouldStop: () => boolean,
): Promise<void> {
  while (!shouldStop()) {
    const pending = await prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const delivery of pending) {
      if (shouldStop()) break;

      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { id: delivery.endpointId },
      });

      if (!endpoint || !endpoint.active) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'CANCELLED' },
        });
        continue;
      }

      const body = JSON.stringify(delivery.payload);
      const signature = createHmac('sha256', endpoint.secret)
        .update(body)
        .digest('hex');

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': delivery.eventType,
            'X-Webhook-Delivery-Id': delivery.id,
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'DELIVERED',
              httpStatus: res.status,
              attempts: delivery.attempts + 1,
              deliveredAt: new Date(),
            },
          });
          log('webhook.delivered', { deliveryId: delivery.id, endpointId: endpoint.id });
        } else {
          await markFailed(prisma, delivery.id, delivery.attempts, res.status, `HTTP ${res.status}`);
        }
      } catch (err) {
        await markFailed(prisma, delivery.id, delivery.attempts, null, String(err));
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function markFailed(
  prisma: PrismaClient,
  id: string,
  currentAttempts: number,
  httpStatus: number | null,
  error: string,
): Promise<void> {
  const attempts = currentAttempts + 1;
  await prisma.webhookDelivery.update({
    where: { id },
    data: {
      attempts,
      httpStatus,
      lastError: error.slice(0, 500),
      status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
    },
  });
  log('webhook.delivery_failed', { deliveryId: id, attempts, error: error.slice(0, 200) });
}
