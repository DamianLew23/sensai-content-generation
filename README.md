# Sens.ai Content Generation

Internal content generation app (Plan 1: Foundation).

## Dev setup

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Edit apps/api/.env — set OPENROUTER_API_KEY
pnpm dev:infra              # start postgres + redis
pnpm db:migrate             # run migrations
pnpm db:seed                # seed project + template
pnpm dev:api                # in terminal 1
pnpm dev:web                # in terminal 2
```

Frontend: http://localhost:7000
API:      http://localhost:8000

## Verified end-to-end (Plan 1)

Smoke-tested: create run via UI → OpenRouter LLM call → brief output JSON → cost recorded in `llm_calls`.
Failure path: 3 retries + `failed` status + error visible in UI.
Reconcile: restart during active run resumes automatically.
