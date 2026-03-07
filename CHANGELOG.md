# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
