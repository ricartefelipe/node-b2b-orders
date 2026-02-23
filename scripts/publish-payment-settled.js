#!/usr/bin/env node
/**
 * Publica evento payment.settled no RabbitMQ para simular py-payments-ledger.
 * Uso: node scripts/publish-payment-settled.js <orderId> <tenantId>
 */
const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5673';
const PAYMENTS_EXCHANGE = process.env.PAYMENTS_EXCHANGE || 'payments.x';

async function main() {
  const [, , orderId, tenantId] = process.argv;
  if (!orderId || !tenantId) {
    console.error('Usage: node scripts/publish-payment-settled.js <orderId> <tenantId>');
    process.exit(1);
  }

  const conn = await amqp.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange(PAYMENTS_EXCHANGE, 'topic', { durable: true });

  const payload = {
    orderId,
    tenantId,
    correlationId: `smoke-${Date.now()}`,
  };
  ch.publish(
    PAYMENTS_EXCHANGE,
    'payment.settled',
    Buffer.from(JSON.stringify(payload)),
    {
      contentType: 'application/json',
      persistent: true,
      headers: {
        'X-Correlation-Id': payload.correlationId,
        'X-Tenant-Id': tenantId,
      },
    },
  );
  console.log('Published payment.settled', payload);
  await ch.close();
  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
