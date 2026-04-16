# Sens.ai Content Generation

Internal content generation app (Plan 1: Foundation).

## Dev setup

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit apps/api/.env — set OPENROUTER_API_KEY
pnpm dev:infra              # start postgres + redis
pnpm db:migrate             # run migrations
pnpm db:seed                # seed project + template
pnpm dev:api                # in terminal 1
pnpm dev:web                # in terminal 2
```

Frontend: http://localhost:3000
API:      http://localhost:4000
