import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, Subscriber } from 'rxjs';

export interface MessageEvent {
  data: string;
  id?: string;
  type?: string;
  retry?: number;
}

interface SseClient {
  tenantId: string;
  observer: Subscriber<MessageEvent>;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly clients = new Map<string, SseClient>();

  addClient(clientId: string, tenantId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      this.clients.set(clientId, { tenantId, observer: subscriber });
      this.logger.log(`SSE client connected: ${clientId} (tenant=${tenantId}, total=${this.clients.size})`);

      const heartbeat = setInterval(() => {
        if (subscriber.closed) {
          clearInterval(heartbeat);
          return;
        }
        subscriber.next({ data: '', type: 'heartbeat', id: randomUUID() });
      }, 30_000);

      return () => {
        clearInterval(heartbeat);
        this.clients.delete(clientId);
        this.logger.log(`SSE client disconnected: ${clientId} (tenant=${tenantId}, total=${this.clients.size})`);
      };
    });
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.observer.complete();
      this.clients.delete(clientId);
    }
  }

  broadcast(tenantId: string, eventType: string, data: Record<string, unknown>): void {
    const eventId = randomUUID();
    const payload: MessageEvent = {
      data: JSON.stringify(data),
      type: eventType,
      id: eventId,
    };

    let sent = 0;
    for (const [, client] of this.clients) {
      if (client.tenantId === tenantId && !client.observer.closed) {
        client.observer.next(payload);
        sent++;
      }
    }

    if (sent > 0) {
      this.logger.debug(`Broadcast ${eventType} to ${sent} client(s) for tenant ${tenantId}`);
    }
  }

  getActiveClients(tenantId: string): number {
    let count = 0;
    for (const [, client] of this.clients) {
      if (client.tenantId === tenantId && !client.observer.closed) count++;
    }
    return count;
  }
}
