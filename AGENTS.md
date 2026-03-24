# AGENTS.md — Diretrizes para assistentes no node-b2b-orders

Regras para quem altera este repositório (humanos ou assistentes automatizados).

---

## Git Flow

- Branches: `master` (produção), `develop` (staging), `feature/*`, `fix/*`, `docs/*`.
- Trabalho novo: criar `feature/...` ou `fix/...` a partir de `develop` atualizada; **nunca** commit direto em `develop` ou `master`.
- Integração em `develop`: via PR ou merge local equivalente; **CI verde** antes de mergear.
- **Release** `develop` → `master`: só quando o responsável pedir.

---

## Qualidade e verificação

- NestJS + TypeScript + Prisma; `npm run lint`, `npm run build`, `npm test`.
- E2E quando aplicável: `npm run test:e2e` (depende de infra local/config).
- Contratos com spring-saas-core / py-payments-ledger: ver `docs/PROMPT-EVOLUCAO.md` e OpenAPI do serviço.

---

## Commits e documentação

- Mensagens de commit **claras**.
- **Não** incluir marcas comerciais de IDEs ou assistentes em commits, PRs ou documentação (nem rodapés automáticos).

---

## Papel do agente (delegação)

- Pode executar no repo: branches, código, testes, lint, commit, push, PR e merge em `develop` após CI verde.
- **Limites:** sem painéis cloud nem credenciais; sem `sudo` na máquina do utilizador.

---

## Referências

- `docs/PROMPT-EVOLUCAO.md`
- Pipeline alinhado: **fluxe-b2b-suite** — `docs/PIPELINE-ESTEIRAS.md`
