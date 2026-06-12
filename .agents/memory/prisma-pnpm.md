---
name: Prisma pnpm setup
description: How to properly set up Prisma client in a pnpm monorepo so it generates to the right location
---

## Rules

1. Add `@prisma/client` to `onlyBuiltDependencies` in `pnpm-workspace.yaml` (alongside `prisma` and `@prisma/engines`).
2. Do NOT set a custom `output` in the `generator client` block in schema.prisma — let it default to the pnpm-resolved location.
3. Add `npx prisma generate --schema=./prisma/schema.prisma` as the FIRST step in the `dev` script (before build). This ensures the generated client ends up in the correct hoisted pnpm location.
4. The schema uses `url = env("DATABASE_URL")` in the datasource (standard Prisma v5 approach).
5. After schema changes, run: `cd artifacts/api-server && npx prisma db push --schema=./prisma/schema.prisma`

**Why:** pnpm hoists `@prisma/client` to `node_modules/.pnpm/@prisma+client@X.Y.Z.../node_modules/@prisma/client`. If you set a custom `output`, the generated client lands in a different path than where Node.js resolves `@prisma/client` from, causing "did not initialize yet" errors at startup.

**How to apply:** Any time the Prisma schema changes, run db push AND restart the api-server workflow (which auto-regenerates via the dev script).
