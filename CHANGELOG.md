# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-10-29

### Fixed
- Conflito de peers resolvido na origem: `@nestjs/platform-fastify` ≥ 11.2.8 (aceita `@fastify/static ^10.1.2`); `.npmrc` sem `legacy-peer-deps`.
- `npm audit --audit-level=high` de 19 HIGH para 0: overrides de `fastify`, `fast-uri`, `@grpc/grpc-js`, `js-yaml` e `brace-expansion` em versões sem advisory.
- Retries dos Dockerfiles e do seed do entrypoint falham ao esgotar as tentativas em vez de terminar com sucesso.

### Changed
- Workflow `sync-master-with-develop` (reset + force-push em `master`) substituído por `check-master-sync`, uma comparação somente leitura.

## [1.0.0] - 2026-03-07

### Added
- B2B order management API with full CRUD operations
- Product catalog with inventory tracking
- Audit endpoint for order lifecycle events
- Access denied logging for security monitoring
- Event contracts documentation for inter-service communication
- E2E and smoke test suites
- CI/CD pipeline with GitHub Actions
- Multi-arch Docker build (amd64 + arm64) for Oracle Cloud ARM
- Docker image published to GHCR
- RabbitMQ integration for event-driven communication with control plane
- Prisma ORM with PostgreSQL

### Changed
- Updated dependencies and README documentation
- Seed data adjusted for development environment

### Fixed
- OpenSSL added to Alpine runtime for Prisma engine detection
- Docker build compatibility with Prisma on Alpine Linux
- E2E tests and smoke script corrections
- Docker UID/GID set to 2000 for shared RabbitMQ compatibility

### Security
- Security hardening with JWT validation from spring-saas-core
- Access denied events logged to audit trail
