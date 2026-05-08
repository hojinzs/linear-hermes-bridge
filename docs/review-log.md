# Review Log

This document records the requested five review passes before the initial public commit.

## Pass 1 — Requirement coverage

Checklist:

- R1 Docker-first self-hosted deployment is covered in `docs/requirements.md` and `docs/deployment.md`.
- R2 public tunnel/private Hermes boundary is covered in `docs/architecture.md`, `docs/deployment.md`, and `docs/security.md`.
- R3 multi-agent routing is covered in `docs/requirements.md`, `docs/architecture.md`, and `docs/data-model.md`.
- TypeScript-first constraint is covered in `README.md` and `docs/implementation-plan.md`.

Result: initial draft covers the stated MVP requirements.

## Pass 2 — Architecture clarity

Checklist:

- Component diagram identifies public tunnel, bridge, database, Agent Run Queue, Orchestrator, Agent Runner, Hermes connector, and local Hermes.
- Sequence diagrams cover OAuth installation and Linear mention/delegation flow.
- Multi-agent routing is URL-scoped by `agentSlug`.
- Failure handling table exists.

Finding: architecture was understandable, but route-level contracts were not explicit enough.

Action taken: added `docs/api-contracts.md` and linked it from `README.md`.

Result: architecture now has both conceptual diagrams and concrete route contracts.

## Pass 3 — Security and privacy

Checklist:

- Linear webhook `linear-signature` verification is documented.
- OAuth state handling is documented.
- Token encryption at rest is documented.
- Hermes is local-only by default.
- Human approval boundaries are explicit.
- Prompt injection from Linear content is acknowledged.

Result: MVP security model is conservative and suitable for design-stage publication.

## Pass 4 — Data model and operations

Checklist:

- Agents, OAuth states, installations, sessions, deliveries, Agent Run Jobs, run attempts, and runner events are modeled.
- SQLite-first deployment is consistent with homelab use.
- Backup/restore instructions exist.
- Idempotency and retries are represented.
- Linear manual setup and smoke-test path are documented in `docs/linear-setup.md`.

Action taken: added `docs/linear-setup.md` so the MVP does not depend on automatic Linear OAuth app creation.

Result: data model and operator workflow support the MVP and leave a clear path to Postgres/Redis later.

## Pass 5 — Implementation readiness

Checklist:

- Implementation plan is phased.
- Tasks are TypeScript-oriented.
- Open decisions are isolated in `docs/open-decisions.md`.
- MVP avoids premature SaaS/Kubernetes/enterprise scope.

Result: ready for initial commit as a design-first repository. Remaining decisions are intentionally called out for Steve.
