# SplitPay — project rules

Telegram expense-sharing bot + Mini App. Monorepo: `apps/server` (Fastify + grammY bot + Drizzle/Postgres, serves the web build), `apps/web` (React + Vite Mini App), `packages/shared` (types + Zod).

## Commands (pnpm via corepack)

```
corepack pnpm dev        # server :3000 + web :5173
corepack pnpm db:push    # sync schema to Postgres (drizzle-kit)
corepack pnpm db:seed    # demo data
corepack pnpm build      # typecheck server, build shared + web
```

## Conventions

- **Comments: compact.** One short line, only when the "why" isn't obvious. No block/JSDoc headers, no restating the code. Don't write docs unless asked.
- **Money = integer cents** everywhere. Format for display only (`formatCents`). Never float math on money.
- **Handlers thin, services fat.** All business logic in `apps/server/src/services`. Bot commands (`bot/`) and API routes (`api/`) only parse input, call a service, format output — no DB queries or logic there.
- **One source of truth for wire types:** `packages/shared`. Never redeclare a DTO in the frontend.
- **Validate at boundaries** with Zod: env, parser output, API bodies, initData.
- **Trust nothing from the client.** Caller identity comes from verified `initData`, not request params.
- **DB via Drizzle only** (`db/client.ts`). Schema in `db/schema.ts`; change it then `db:push`.
- **TON stays behind `services/ton`.** Nothing else imports a TON lib; swap the provider to go on-chain.

## Style

- TypeScript strict, ESM, `.js` extensions not required (Bundler resolution).
- Prefer small pure functions; keep files focused.
- Errors: throw `AppError(msg, statusCode)` for expected 4xx.
