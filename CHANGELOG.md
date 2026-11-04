# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.8] - 2026-11-04

### Fixed
- a API, o contrato exportado e os traços anunciam a versão da release (antes 1.0.0); um teste prende a versão ao CHANGELOG.

### Security
- Prometheus 3.15.1 e Grafana 12.4.14 fixados por digest no ambiente de observabilidade.

## [1.4.7] - 2026-11-03

### Fixed
- o despachante do outbox encerra quando o canal fecha: a cada reconexão com o RabbitMQ, o anterior seguia em laço com o canal fechado, e pedidos novos ficavam em `CREATED`. Depois de duas quedas do broker, o pedido é pago em cerca de 4 s.

### Changed
- RabbitMQ 4.4.0 no ambiente local, nos testes de ponta a ponta e na CI; `amqplib` passa a exigir 0.10.7 ou mais nova.

## [1.4.6] - 2026-11-03

### Fixed
- acompanha no contrato de identidade o escopo do token. O código da aplicação não muda.

## [1.4.5] - 2026-11-02

### Security
- O preço e o total do pedido passam a vir do catálogo do locatário. `price` no pedido ficou opcional: divergência responde 409 e SKU desconhecido ou inativo responde 422.

### Fixed
- Cinco imagens da carga inicial que respondiam 404.

## [1.4.4] - 2026-11-02

### Removed
- Configuração e documentação do Railway, descontinuado.

## [1.4.3] - 2026-11-02

### Fixed
- O pedido passa a gravar `totalAmount` na criação. Sem o total, a loja enviava o pagamento sem valor e o checkout falhava na última etapa.
- As imagens instalam OpenSSL antes de `npm ci`, para trazer o motor certo do Prisma e não baixá-lo na subida do container.

## [1.4.2] - 2026-10-30

### Fixed
- Idempotência durável: registro (tenant, operação, chave, impressão digital, resposta) gravado na mesma transação do efeito para criação de pedido e ajuste de inventário; repetição devolve a mesma resposta, corpo diferente responde `409`, perda do Redis não permite efeito duplicado, concorrência aplica o efeito uma única vez; entradas legadas conferidas contra o efeito persistido.
- Movimentos de estoque atômicos no banco (`increment`/`decrement` condicional): ajustes concorrentes não perdem atualização e o débito acima do saldo é recusado sob concorrência.

### Changed
- Publicação das imagens no GHCR só após os gates do mesmo SHA (build, e2e, security e scan da imagem), em push para develop/master, com tag pelo SHA completo; `build-push.yml` removido.

## [1.4.1] - 2026-10-30

### Fixed
- Idempotência de criação de pedido passa a comparar a impressão digital do corpo (cliente e itens ordenados): a mesma `X-Idempotency-Key` com corpo diferente responde `409` em vez de devolver o pedido anterior; entradas antigas sem impressão digital continuam sendo respondidas.

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
