---
name: Incentiq stack decisions
description: Key non-obvious choices for the Incentiq commission wallet platform
---

## Decisions

**Prisma v5 (not v7):** Prisma v7 removed datasource `url` from schema files; must use `prisma.config.ts` and adapter pattern. Downgraded to v5 to avoid breaking changes.

**JWT via SESSION_SECRET:** Uses `process.env.JWT_SECRET || process.env.SESSION_SECRET` in `artifacts/api-server/src/middlewares/auth.ts`. SESSION_SECRET is already set as a Replit secret.

**Currency:** South African Rand, formatted as `R X,XXX.XX`. All commission values are in ZAR.

**Dark mode:** Applied globally via `class="dark"` on `<html>` in `artifacts/incentiq/index.html`. The Tailwind theme has dark variables for the dark navy/indigo fintech look.

**Multi-tenant:** Every model has `tenantId`. Register creates a new Tenant + seeded demo deals and commission rules automatically.

**Why:** User requested Prisma specifically (not Drizzle), ZAR currency, and dark navy fintech design.

**How to apply:** When adding new routes/models, always include `tenantId` in queries. Auth middleware injects `req.user.tenantId`.
