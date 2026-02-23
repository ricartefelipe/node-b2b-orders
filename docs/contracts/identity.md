# Contratos de Identidade (JWT e Claims)

## JWT

- **Algoritmo:** HS256
- **Issuer:** Configurável via `JWT_ISSUER` (default: local-auth)
- **Expiração:** Configurável via `TOKEN_EXPIRES_SECONDS` (default: 3600)

## Claims do token

| Claim | Tipo | Descrição |
|-------|------|-----------|
| sub | string | ID do usuário (required pelo JWT spec) |
| email | string | Email do usuário |
| tid | string | Tenant ID (`*` para admin global) |
| roles | string[] | Roles do usuário (ex: `["ops"]`) |
| plan | string | Plano do tenant (ex: `pro`, `free`) |
| region | string | Região do tenant (ex: `region-a`) |

## RBAC

Permissões são atribuídas via roles:
- `admin`: acesso total (bypass ABAC quando tid === `*`)
- `ops`: orders:rw, inventory:rw, profile:r
- `sales`: orders:r, inventory:r, profile:r

## ABAC (default-deny)

Políticas no banco (`Policy`):
- `effect`: `allow` ou `deny`
- `allowedPlans`: array de planos permitidos (ex: `["pro"]`). Se vazio, todos os planos.
- `allowedRegions`: array de regiões permitidas. Se vazio, todas as regiões.

**Regra:** deny precedence — se policy.effect === `deny`, sempre nega. Se `allow`, valida plan/region.

## TenantGuard

- Header obrigatório: `X-Tenant-Id`
- Admin global (tid === `*`): pode acessar qualquer tenant via header
- Demais usuários: `X-Tenant-Id` deve ser igual a `req.user.tid`
