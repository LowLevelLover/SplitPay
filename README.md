# SplitPay 💰

Telegram expense-sharing bot + Mini App. Mention the bot in a group to record
a shared expense; it computes balances, minimizes "who pays whom", and shows it
all in a Telegram Mini App. Designed for future TON settlement (see
`apps/server/src/services/ton`).

## Stack

- **Backend** — Node + TypeScript, [Fastify], [grammY] (bot), [Drizzle] + PostgreSQL.
  One process serves the webhook, the REST API, and the built Mini App.
- **Frontend** — React + TypeScript + Vite, Telegram UI kit, TanStack Query.
- **Shared** — types + Zod schemas imported by both (`packages/shared`).

## Layout

```
apps/server   Fastify app: bot (parser/commands), /api, serves the web build
apps/web      React Mini App
packages/shared  Shared DTOs + Zod schemas (the wire contract)
```

## Run it (dev)

Invoke pnpm via `corepack pnpm` (the version is pinned in package.json).

```bash
corepack pnpm install
cp .env.example .env            # fill in BOT_TOKEN + PUBLIC_URL (a tunnel)

corepack pnpm db:up             # start Postgres (docker)
corepack pnpm db:push           # create tables (drizzle-kit push)
corepack pnpm db:seed           # demo group + expenses (optional)

corepack pnpm dev               # server :3000 + web :5173
```

Expose the server so Telegram can reach it (`ngrok http 3000` or
`cloudflared tunnel`), set that HTTPS URL as `PUBLIC_URL`, and set the Mini App
URL in @BotFather to the same origin. The webhook is registered automatically
on startup.

## Production-ish

```bash
pnpm build      # builds shared + web, typechecks server
pnpm start      # single process serves API + webhook + Mini App
```

## Key conventions

- **Money is integer cents** everywhere. Format for display only.
- **Handlers are thin, services are fat.** All business logic lives in
  `apps/server/src/services`; the bot and the API both call it — no duplication.
- **Validate at every boundary** with Zod (env, parser output, API bodies, initData).
- **TON stays behind `services/ton`** — swap the provider to go on-chain later.

[Fastify]: https://fastify.dev
[grammY]: https://grammy.dev
[Drizzle]: https://orm.drizzle.team
