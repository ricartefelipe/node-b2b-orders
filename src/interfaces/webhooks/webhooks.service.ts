import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { WebhookEndpointResponse, WebhookDeliveryResponse } from './dto';

const MAX_ATTEMPTS = 5;
const DELIVERY_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async registerEndpoint(
    tenantId: string,
    url: string,
    events: string[],
    secret: string,
  ): Promise<WebhookEndpointResponse> {
    const ep = await this.prisma.webhookEndpoint.create({
      data: { tenantId, url, events, secret },
    });
    return this.toEndpointResponse(ep);
  }

  async listEndpoints(tenantId: string): Promise<WebhookEndpointResponse[]> {
    const eps = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return eps.map((ep) => this.toEndpointResponse(ep));
  }

  async deleteEndpoint(id: string, tenantId: string): Promise<void> {
    const ep = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId },
    });
    if (!ep) throw new NotFoundException('webhook endpoint not found');
    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  async listDeliveries(
    endpointId: string,
    tenantId: string,
  ): Promise<WebhookDeliveryResponse[]> {
    const ep = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId },
    });
    if (!ep) throw new NotFoundException('webhook endpoint not found');

    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return deliveries.map((d) => this.toDeliveryResponse(d));
  }

  async enqueueDelivery(
    eventType: string,
    payload: Record<string, unknown>,
    tenantId: string,
  ): Promise<number> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        tenantId,
        active: true,
        events: { has: eventType },
      },
    });

    if (endpoints.length === 0) return 0;

    await this.prisma.webhookDelivery.createMany({
      data: endpoints.map((ep) => ({
        endpointId: ep.id,
        eventType,
        payload: payload as Prisma.InputJsonValue,
      })),
    });

    return endpoints.length;
  }

  async processDeliveries(): Promise<number> {
    const pending = await this.prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    let delivered = 0;

    for (const delivery of pending) {
      const endpoint = await this.prisma.webhookEndpoint.findFirst({
        where: { id: delivery.endpointId },
      });
      if (!endpoint || !endpoint.active) {
        await this.prisma.webhookDelivery.update({
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
        const timeout = setTimeout(
          () => controller.abort(),
          DELIVERY_TIMEOUT_MS,
        );

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
          await this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'DELIVERED',
              httpStatus: res.status,
              attempts: delivery.attempts + 1,
              deliveredAt: new Date(),
            },
          });
          delivered++;
        } else {
          await this.markFailed(
            delivery.id,
            delivery.attempts,
            res.status,
            `HTTP ${res.status}`,
          );
        }
      } catch (err) {
        await this.markFailed(
          delivery.id,
          delivery.attempts,
          null,
          String(err),
        );
      }
    }

    return delivered;
  }

  private async markFailed(
    id: string,
    currentAttempts: number,
    httpStatus: number | null,
    error: string,
  ): Promise<void> {
    const attempts = currentAttempts + 1;
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        attempts,
        httpStatus,
        lastError: error.slice(0, 500),
        status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
      },
    });
  }

  private toEndpointResponse(ep: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
    createdAt: Date;
  }): WebhookEndpointResponse {
    return {
      id: ep.id,
      url: ep.url,
      events: ep.events,
      active: ep.active,
      createdAt: ep.createdAt,
    };
  }

  private toDeliveryResponse(d: {
    id: string;
    eventType: string;
    status: string;
    httpStatus: number | null;
    attempts: number;
    lastError: string | null;
    createdAt: Date;
    deliveredAt: Date | null;
  }): WebhookDeliveryResponse {
    return {
      id: d.id,
      eventType: d.eventType,
      status: d.status,
      httpStatus: d.httpStatus,
      attempts: d.attempts,
      lastError: d.lastError,
      createdAt: d.createdAt,
      deliveredAt: d.deliveredAt,
    };
  }
}
