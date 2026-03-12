# Schema Registry for Events

JSON Schema definitions for domain events published and consumed by node-b2b-orders.

## Event types and schema files

| Event Type | Schema File | Description |
|------------|-------------|-------------|
| `order.created` | order.created.json | Order created |
| `order.confirmed` | order.confirmed.json | Order confirmed |
| `order.shipped` | order.shipped.json | Order shipped with tracking |
| `order.delivered` | order.delivered.json | Order delivered |
| `order.cancelled` | order.cancelled.json | Order cancelled |
| `payment.charge_requested` | charge_requested.json | Charge request to payments |
| `inventory.reserved` | inventory.reserved.json | Stock reserved (stock.reserved) |
| `inventory.released` | inventory.released.json | Stock released on cancel |

## JSON Schema format

All schemas use JSON Schema draft-07 (`$schema: "http://json-schema.org/draft-07/schema#"`).

## Validation

Use `src/shared/events/schema-validator.ts` to validate event payloads at runtime.
