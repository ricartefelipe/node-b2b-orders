# Compliance — node-b2b-orders

## O que é auditado

### Ações de negócio
| Ação | Descrição |
|------|-----------|
| `order.created` | Criação de pedido |
| `order.confirmed` | Confirmação de pedido |
| `order.cancelled` | Cancelamento de pedido |
| `inventory.adjustment` | Ajuste de inventário (IN/OUT/ADJUSTMENT) |

### Segurança
| Ação | Descrição |
|------|-----------|
| `access_denied` | Tentativa de acesso negada (tenant mismatch, permissão ausente, política ABAC) |

Cada registro contém: `tenantId`, `actorSub`, `action`, `target`, `detail` (JSON), `correlationId`, `createdAt`.

## Consulta de audit logs

- `GET /v1/audit` — listagem com filtros (`action`, `startDate`, `endDate`) e paginação
- `GET /v1/audit/export` — exportação JSON com filtro de datas

Ambos os endpoints requerem permissão `audit:read`.

## Política de retenção

- Registros armazenados na tabela `AuditLog` (PostgreSQL)
- Retenção ilimitada por padrão (sem purge automático)
- Recomendação: implementar job de purge ou archival para registros > 90 dias em produção

## Considerações de PII

- Audit logs contêm `actorSub` (identificador do usuário) e `tenantId`
- Não são armazenados dados pessoais (nome, email, telefone) nos registros de auditoria
- O campo `detail` pode conter IDs de recursos (orderId, productId) mas não dados sensíveis

## Exportação de dados

- Endpoint `/v1/audit/export` retorna até 10.000 registros em JSON
- Filtros de data permitem exportação por período
- Formato compatível com ferramentas de análise (JSON array)

## Segurança dos dados de auditoria

- Acesso restrito por RBAC (permissão `audit:read`)
- Protegido por TenantGuard (isolamento multi-tenant)
- Protegido por AbacGuard (políticas ABAC)
- Registros são append-only (sem UPDATE/DELETE via API)
