# Política de versão de contratos

A política **canónica** está em **spring-saas-core**:

- Repositório: `ricartefelipe/spring-saas-core`
- Caminho: [`docs/contracts/POLITICA-VERSAO-CONTRATO.md`](https://github.com/ricartefelipe/spring-saas-core/blob/develop/docs/contracts/POLITICA-VERSAO-CONTRATO.md) (branch `develop`)

Os ficheiros `events.md`, `headers.md`, `identity.md` e `schemas/*.json` nesta pasta são **espelhos**; alterações começam sempre no Core e validam-se com `check-contract-drift` no `fluxe-b2b-suite`.
