# Mirrorball Madness

A fantasy game for *Dancing with the Stars*. Friends form leagues, draft the
season's couples, call each week's elimination and top scorer, and predict
the full finishing order before the premiere. One site admin enters the
show's scores each night, and every league's standings follow.

The three scoring modules are **Curtain Call** (weekly picks), **Dance Card**
(your drafted couples' judges' scores and survival) and **Grand Finale** (a
season bracket). Leagues can also turn on **Lifeline**, **Recast** (waivers)
and **Trades**.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui on Base UI ·
Supabase (Auth, Postgres, Realtime) · Vitest with PGlite · Capacitor for the
iOS wrapper. Deployed on Vercel.

## Getting started

Open the repo in its dev container (`.devcontainer/devcontainer.json`), which
installs Node, Chromium for headless checks and forwards port 3000. Then:

```
cp .env.example .env.local   # fill in the Supabase URL and keys
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` | Production build, including the type-check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests and PostgreSQL tests against an in-memory PGlite database; no live database needed |

## Where things live

| Path | Contents |
|---|---|
| `src/app/` | Routes. The fan tabs are Home (`(fan)/`), Results (`this-week/`), and each league's Picks and Standings (`leagues/[id]/`); site admin pages are under `admin/`. |
| `src/lib/` | Scoring and game logic as plain, mostly database-free functions, each with its test beside it, plus the data loaders (`*-data.ts`). |
| `src/components/` | React components; `ui/` holds the generated shadcn primitives. |
| `supabase/schema.sql` | The base schema. Later changes are the `apply-*.sql` files beside it, applied by hand in the Supabase SQL editor. |
| `supabase/queries/` | One-off read and repair queries. |
| `scripts/` | Operational scripts: backups, recomputing published weeks, Dance Card rule switches, scoring calibration and the headless screenshot kit. |
| `docs/design/` | Mocks and plans, one folder per feature. |
| `docs/audits/` | The October 2026 audit reports and their release runbook. |
| `ios/` | The Capacitor iOS project. |

`CLAUDE.md` is the working guide: architecture, conventions, how each feature
behaves and the decisions behind it. `BACKLOG.md` lists what is deferred.

## Database changes

Every user-facing write goes through a `SECURITY DEFINER` Postgres function
that checks who is asking. A schema change is written as a new
`supabase/apply-*.sql` file, rehearsed in a PGlite test, applied to the live
project, and only then is the app that depends on it deployed. After applying
one, regenerate the types:

```
npx supabase gen types typescript --project-id wssbwgtsejamlbvfofvu --schema public > src/lib/supabase/types.ts
```
