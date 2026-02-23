# Headers HTTP

## Request Headers

| Header | Obrigatório | Descrição |
|--------|-------------|-----------|
| Authorization | sim (endpoints protegidos) | `Bearer <JWT>` |
| X-Tenant-Id | sim (exceto auth) | ID do tenant |
| X-Correlation-Id | não | ID para rastreio distribuído (gerado se ausente) |
| Idempotency-Key | sim (POST write) | Chave única para operações idempotentes |

## Response Headers

| Header | Contexto | Descrição |
|--------|----------|-----------|
| x-correlation-id | sempre | Echo ou valor gerado do request |
| X-RateLimit-Limit | 429 | Limite configurado |
| X-RateLimit-Remaining | 429 | Tokens restantes |
| Retry-After | 429 | Segundos até retry sugerido |
