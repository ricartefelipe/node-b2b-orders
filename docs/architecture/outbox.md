# Outbox Pattern

## Transacionalidade

A criação do evento outbox ocorre **na mesma transação** que a mudança de estado da entidade:

1. **OrdersService.createOrder**: `prisma.$transaction` cria `order` + `outboxEvent (order.created)`
2. **OrdersService.confirmOrder**: `prisma.$transaction` atualiza `order` para CONFIRMED + `outboxEvent (order.confirmed)`
3. **OrdersService.cancelOrder**: `prisma.$transaction` atualiza `order` para CANCELLED + `outboxEvent (order.cancelled)`
4. **Worker (order.confirmed)**: `prisma.$transaction` atualiza reservas + `outboxEvent (payment.charge_requested)`

Garantia: se a transação falhar, nem o estado nem o evento são persistidos.

## Dispatcher (Worker)

O worker roda um loop que:

1. Seleciona eventos `status=PENDING` com `availableAt <= now` e `lockedAt` null ou stale (>60s)
2. Faz claim via `updateMany` (lockedAt, lockedBy)
3. Publica no RabbitMQ (orders.x ou payments.x conforme eventType)
4. Em sucesso: `status=SENT`, `lockedAt=null`
5. Em falha: incrementa `attempts`, aplica backoff exponencial (2^min(attempts,6) segundos)
6. Após **7 tentativas**: `status=DEAD` (não será mais processado)

Retry/backoff: `availableAt = now + min(60, 2^attempts)` segundos.
