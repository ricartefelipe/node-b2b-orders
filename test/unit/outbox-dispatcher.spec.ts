import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn() })),
}));

import { dispatchOutbox } from '../../src/worker/main';

function fakeChannel() {
  const ch = new EventEmitter() as EventEmitter & { publish: jest.Mock };
  ch.publish = jest.fn().mockReturnValue(true);
  return ch;
}

function fakePrisma() {
  return {
    outboxEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('dispatchOutbox', () => {
  it('para quando o canal fecha, para a reconexão seguir com um único despachante', async () => {
    const ch = fakeChannel();
    const prisma = fakePrisma();

    const running = dispatchOutbox(prisma as unknown as PrismaClient, ch as never, 'w1');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(prisma.outboxEvent.findMany).toHaveBeenCalledTimes(1);

    ch.emit('close');
    await running;

    const polls = prisma.outboxEvent.findMany.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(prisma.outboxEvent.findMany).toHaveBeenCalledTimes(polls);
  });

  it('não reivindica eventos depois que o canal fecha no meio do lote', async () => {
    const ch = fakeChannel();
    const prisma = fakePrisma();
    const pending = (id: string) => ({
      id,
      tenantId: 't1',
      eventType: 'order.created',
      aggregateId: 'o1',
      payload: { orderId: 'o1' },
      attempts: 0,
      lockedAt: null,
    });
    prisma.outboxEvent.findMany.mockResolvedValueOnce([pending('e1'), pending('e2')]);
    prisma.outboxEvent.update.mockImplementationOnce(async () => {
      ch.emit('close');
      return {};
    });

    await dispatchOutbox(prisma as unknown as PrismaClient, ch as never, 'w1');

    expect(ch.publish).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledTimes(1);
  });
});
