# NestJS 11 + Fastify 5

O serviço foi atualizado para **@nestjs/\*** v11 e **fastify** v5 para fechar vulnerabilidades reportadas pelo `npm audit` (middleware Fastify, `js-yaml`, `lodash`, etc.).

## Notas técnicas

- **JWT strategy** (`src/interfaces/auth/jwt.strategy.ts`): `super()` usa dois ramos — com `secretOrKeyProvider` (JWKS / rotação HS256) ou só `secretOrKey` — para satisfazer os tipos do `passport-jwt` atualizados.
- **Removido** `overrides.minimatch` no `package.json`: o override global quebrava o Jest (`minimatch is not a function`). Com Nest 11, `npm audit` fica a **0 vulnerabilidades** sem esse override.

## Verificação local

```bash
npm ci && npm run lint && npm run build && npm test && npm audit
```
