# Freeland Web App Architecture (v2)

## Monorepo Layout
- `apps/web` — React + Vite + TypeScript frontend
- `apps/api` — Fastify + TypeScript backend
- `packages/shared` — shared schemas/types (Zod)

## Design Principles
1. Modular domains (portfolio, treasury, governance)
2. Contract-first API with runtime validation
3. Separation of public pages and admin dashboard
4. Observable and deployable in small increments

## Initial Modules
- `health` (api heartbeat)
- `portfolio` (property list/read model)
- `treasury` (balance/read model)

## Next Steps
1. Add Postgres + Prisma to `apps/api`
2. Add TanStack Query in `apps/web`
3. Add auth + role-based admin routes
4. Connect API to live project data sources
