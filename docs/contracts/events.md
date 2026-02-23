# Contratos de Eventos (RabbitMQ)

Este documento descreve o formato canônico dos eventos publicados e consumidos pela API node-b2b-orders e pela integração com py-payments-ledger.

## Exchange e Routing Keys

| Exchange | Routing Key | Origem | Destino |
|---------|-------------|--------|---------|
| orders.x | order.created | API (outbox) | Worker |
| orders.x | order.confirmed | API (outbox) | Worker |
| orders.x | order.cancelled | API / Worker (outbox) | Worker |
| orders.x | stock.reserved | Worker (outbox) | - |
| payments.x | payment.charge_requested | Worker (outbox) | py-payments-ledger |
| payments.x | payment.settled | py-payments-ledger | Worker |

## payment.charge_requested (node-b2b-orders → py-payments-ledger)

Publicado pelo worker quando um pedido é confirmado. O py-payments-ledger deve consumir deste exchange para processar cobrança.

**Exchange:** `payments.x` (ou `PAYMENTS_EXCHANGE`)

**Routing Key:** `payment.charge_requested`

**Headers AMQP:**
- `X-Correlation-Id`: string (correlation ID para rastreabilidade)
- `X-Tenant-Id`: string (tenant do pedido)

**Payload (camelCase canônico):**
```json
{
  "orderId": "uuid",
  "tenantId": "tenant_demo",
  "correlationId": "string-opcional",
  "customerId": "CUST-1",
  "items": [
    { "sku": "SKU-1", "qty": 2, "price": 10.5 }
  ],
  "totalAmount": 21.0,
  "currency": "BRL"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| orderId | string | sim | UUID do pedido |
| tenantId | string | sim | Tenant do pedido |
| correlationId | string | não | ID para rastreio distribuído |
| customerId | string | sim | ID do cliente |
| items | array | sim | Itens do pedido |
| items[].sku | string | sim | SKU do produto |
| items[].qty | number | sim | Quantidade |
| items[].price | number | sim | Preço unitário |
| totalAmount | number | sim | Valor total da cobrança |
| currency | string | sim | Código da moeda (ex: BRL) |

## payment.settled (py-payments-ledger → node-b2b-orders)

Publicado pelo py-payments-ledger quando o pagamento é confirmado. O worker consome e atualiza o pedido para `PAID`.

**Exchange:** `payments.x`

**Routing Key:** `payment.settled`

**Fila de consumo:** `orders.payments` (ou `PAYMENTS_INBOUND_QUEUE`)

**Payload aceito (camelCase ou snake_case):**

```json
{
  "orderId": "uuid",
  "tenantId": "tenant_demo",
  "correlationId": "string-opcional"
}
```

Alternativa snake_case (compatibilidade):
```json
{
  "order_id": "uuid",
  "tenant_id": "tenant_demo",
  "correlation_id": "string-opcional"
}
```

| Campo | camelCase | snake_case | Obrigatório |
|-------|-----------|------------|-------------|
| orderId | orderId | order_id | sim |
| tenantId | tenantId | tenant_id | sim |
| correlationId | correlationId | correlation_id | não |

O worker aceita ambos os formatos para compatibilidade com diferentes implementações de py-payments-ledger.
