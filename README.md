# Vesper

Vesper is a multi-tenant project management app. Teams work inside **workspaces**, which contain **projects**, which contain **tasks** with **comments**. Members are assigned tasks, get an email when that happens, and get a reminder when a task is due.

> **Status:** under active development. The current focus is hardening the backend (TypeScript, authorization, validation and tests), then performance, caching and real-time updates. See [Roadmap](#roadmap).

---

## Features

- Sign-in with email or Google; workspaces are Clerk Organizations with **Admin** / **Member** roles
- Projects with status, priority, dates, a team lead and project members; progress calculated from completed tasks
- Tasks with type, priority, status, optional assignee and a required due date; editable after creation; comments on tasks
- Members can claim unassigned tasks and complete their own; leads and workspace admins manage everything
- Due-date reminders that follow due-date changes (to the assignee, or the project lead if unassigned)
- Dashboard, project analytics and calendar views; light/dark theme
- Background jobs: Clerk → database sync, task-assignment email, due-date reminder
- Per-user rate limits, and a Redis cache for the dashboard with explicit invalidation

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Redux Toolkit, React Router, Axios, Recharts |
| Backend | Node.js, Express 5, TypeScript (strict) |
| Logging | [Pino](https://getpino.io) structured JSON logs with per-request IDs |
| Validation | [Zod](https://zod.dev) schemas for every request body and URL parameter |
| Testing | Vitest + Supertest integration tests against a disposable Postgres in Docker |
| Database | PostgreSQL on [Neon](https://neon.tech), via Prisma 6 and the Neon serverless driver adapter |
| Cache and rate limits | Redis 7 via [ioredis](https://github.com/redis/ioredis); optional (the API fails open without it) |
| Auth | [Clerk](https://clerk.com): users, sessions, Organizations (workspaces) |
| Background jobs | [Inngest](https://www.inngest.com): event-driven functions with retries and sleeps |
| Email | Nodemailer over SMTP ([Brevo](https://www.brevo.com)) |

## Architecture

```
┌──────────────────────────┐        ┌──────────────┐
│  Browser: React SPA      │◄──────►│    Clerk     │  sign-in, sessions,
│  (Vite, Redux)           │  SDK   │              │  organizations
└────────────┬─────────────┘        └──────┬───────┘
             │ REST + "Authorization: Bearer <Clerk session JWT>"
             ▼                               │ webhooks: user.* / organization.*
┌──────────────────────────┐                 ▼
│  Express API (TypeScript)│        ┌──────────────┐
│  requestLogger →         │◄───────│   Inngest    │  runs functions by calling
│  clerkMiddleware →       │  HTTP  │              │  POST /api/inngest
│  protect → rateLimit →   │───────►│              │
│  routes → controllers →  │ events └──────────────┘
│  services (authorization,│   (app/task.assigned)
│  cache) → errorHandler   │        ┌──────────────┐
│  /api/inngest: functions │◄──────►│    Redis     │  rate-limit counters,
└────────────┬─────────────┘        │              │  cached dashboard reads
             │ Prisma               └──────────────┘
             ▼
┌──────────────────────────┐        ┌──────────────┐
│  PostgreSQL (Neon)       │        │  SMTP relay  │◄── task-assignment and
└──────────────────────────┘        └──────────────┘    reminder emails
```

**Request flow.** The client gets a short-lived session JWT from Clerk and sends it with each API call. `requestLogger` assigns a request ID (returned as `X-Request-Id`). `clerkMiddleware()` verifies the token, and `protect` rejects requests with no signed-in user.

**Server layers.** *Controllers* only handle HTTP: they read the user, body and params, call a service, and send the response. *Services* hold the business logic and data access (Prisma). Every permission check lives in one module, `services/authorization.ts` (`requireWorkspaceRole`, `requireProjectLead`, `requireProjectMember`, …).

**Errors.** Services throw `AppError`s (400/403/404/…). Express 5 forwards them to a single `errorHandler`, which returns the status and message. Unexpected errors are logged with their stack and the request ID; the client only gets `500 {"message":"Internal server error","requestId":"…"}`.

**Identity sync.** Users, workspaces and workspace memberships live in Clerk. Clerk sends a webhook for each change, Inngest turns it into an event (`clerk/user.created`, `clerk/organization.created`, …), and an Inngest function copies it into Postgres. That keeps relational data (projects, tasks) joinable with users and workspaces.

**Redis.** Rate limiting (per user, before the routes) and the dashboard cache (inside the services, after the permission check) both use Redis. Postgres stays the source of truth: if Redis is missing or down, requests go straight to the database without limits, and the outage is logged once. See [Caching](#caching) and [Security](#security).

**Background work.** Creating a task emits `app/task.assigned`. If the task has an assignee, an Inngest function emails them, sleeps until the due date, and sends a reminder if the task isn't done by then.

### Data model

```
User ─┬─< WorkspaceMember >─── Workspace ───< Project ───< Task ───< Comment
      ├─< ProjectMember  >─────────────────────┘            │
      ├── owns Workspace / leads Project                    │
      └── assignee of ──────────────────────────────────────┘
```

`WorkspaceMember` holds the role (`ADMIN` / `MEMBER`). User, workspace and membership IDs are Clerk IDs; everything else uses UUIDs. The full schema is in [`server/prisma/schema.prisma`](server/prisma/schema.prisma).

### API

All routes except `/api/inngest` require a Clerk session. Lists are paginated with `?limit=` (1–100, default 50) and an opaque `?cursor=`; responses include `nextCursor` (null on the last page).

Each user gets **300 reads and 60 writes per minute**. Every response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`; over the limit, the API answers `429` with `Retry-After`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/workspaces` | Your workspaces and your role in each |
| GET | `/api/workspaces/:id` | A workspace with its members |
| GET | `/api/workspaces/:id/projects` | Projects you can access, with task counts |
| GET | `/api/workspaces/:id/summary` | Dashboard numbers and short task lists |
| POST | `/api/projects` | Create a project (workspace admin) |
| PUT | `/api/projects` | Update a project (lead or workspace admin) |
| GET | `/api/projects/:id` | A project with members and task counts |
| GET | `/api/projects/:id/tasks` | A page of tasks; filters `status`, `type`, `priority`, `assignee=me\|none\|<userId>` |
| GET | `/api/projects/:id/stats` | Task counts by status, type, priority; overdue |
| GET | `/api/projects/:id/calendar?from=&to=` | Tasks due in a window (≤ 62 days), upcoming, overdue |
| POST | `/api/projects/:id/addMember` | Add a workspace member to a project |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks/:id` | A task with its assignee and project |
| PUT | `/api/tasks/:id` | Update a task (field rules per role) |
| POST | `/api/tasks/delete` | Delete tasks by ID |
| GET | `/api/tasks/:id/comments` | A page of comments, oldest first |
| POST | `/api/comments` | Add a comment to a task |
| GET/POST/PUT | `/api/inngest` | Inngest function endpoint |

## Project structure

```
client/                 React app
  src/pages/            route-level pages
  src/components/       UI components and dialogs
  src/features/         Redux slices
  src/configs/api.js    Axios instance (base URL from VITE_BASEURL)
  src/utils/            shared helpers (e.g. project progress)
server/                 Express API (TypeScript)
  server.ts             app setup, middleware order, routes
  routes/               one router per resource
  controllers/          HTTP only: read the request, call a service, send JSON
  schemas/              Zod request schemas (the source of input types)
  services/             business logic and data access
    authorization.ts    all permission checks
    workspaceCache.ts   Redis cache with versioned keys
  middlewares/          auth guard, rate limiter, request logger, error handler
  inngest/              background functions: index.ts wires triggers, handlers.ts holds the logic
  emails/               email templates (escaped)
  configs/              Prisma client, Redis client, logger, mailer, app URL
  tests/                integration tests, factories, test setup
  utils/AppError.ts     typed HTTP errors
  scripts/              dev tooling (sync:clerk) and benchmarks (scripts/bench)
  bench-results/        benchmark results and query plans
  prisma/               schema and migrations
```

Server scripts (from `server/`): `npm run dev` (watch mode), `npm test`, `npm run typecheck`, `npm run build` (compile to `dist/`), `npm start` (run the build), `npm run db:test`, `npm run redis:dev`, `npm run sync:clerk`, and the `bench:*` scripts (see [Performance](#performance)).

---

## Running locally

### Prerequisites

- Node.js 20+ (developed on Node 24)
- Docker, for Redis and the test database
- Free accounts: **Clerk** and **Neon**. **Brevo** is optional; without it, only the email jobs fail.

### 1. Install

```bash
git clone https://github.com/sammyyaakk/Vesper.git
cd Vesper
cd server && npm install
cd ../client && npm install
```

### 2. Clerk

1. Create an application in the [Clerk dashboard](https://dashboard.clerk.com) with **Email** (and optionally Google) sign-in.
2. **Enable Organizations** (Configure → Organizations). Workspaces are Clerk Organizations, so the app doesn't work without them.
3. From **Configure → API keys**, copy the publishable key (`pk_test_…`) and the secret key (`sk_test_…`).

### 3. Neon

1. Create a project in the [Neon console](https://console.neon.tech). Pick the region closest to you; it can't be changed later.
2. Under **Connect**, copy two connection strings:
   - with **connection pooling on** → `DATABASE_URL` (hostname contains `-pooler`)
   - with **pooling off** → `DIRECT_URL` (used by Prisma migrations)

### 4. Environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

| File | Variable | Value |
|---|---|---|
| `server/.env` | `NODE_ENV` | `development` (enables readable dev logs) |
| | `LOG_LEVEL` | Optional: `debug`, `info` (default), `warn`, `error` |
| | `APP_URL` | Client URL used in email links, e.g. `http://localhost:5173` (required in production) |
| | `REDIS_URL` | `redis://localhost:6379`. Optional: without it, rate limiting and caching are off |
| | `RATE_LIMIT_READS_PER_MINUTE`, `RATE_LIMIT_WRITES_PER_MINUTE` | Optional; default 300 and 60 per user |
| | `CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| | `CLERK_SECRET_KEY` | Clerk secret key (server only, never in the client) |
| | `DATABASE_URL` | Neon pooled connection string |
| | `DIRECT_URL` | Neon direct connection string |
| | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Leave **empty** locally; only needed for Inngest Cloud |
| | `SENDER_EMAIL`, `SMTP_USER`, `SMTP_PASS` | Brevo SMTP credentials (optional locally) |
| `client/.env` | `VITE_CLERK_PUBLISHABLE_KEY` | Same Clerk publishable key |
| | `VITE_BASEURL` | `http://localhost:5000` |

### 5. Create the database tables

```bash
cd server
npx prisma migrate deploy
```

### 6. Start everything (three terminals)

```bash
# 0. Redis (once; keeps running in Docker)
cd server && npm run redis:dev

# 1. API: http://localhost:5000
cd server && npm run dev

# 2. Client: http://localhost:5173
cd client && npm run dev

# 3. Inngest dev server: dashboard at http://localhost:8288
npx --ignore-scripts=false inngest-cli@1.13.7 dev -u http://localhost:5000/api/inngest --no-discovery
```

The Inngest dev server is pinned to **1.13.7** because newer releases reject the Inngest SDK version this project uses (`sdk_version_denied`). `--ignore-scripts=false` lets npm run the install step that downloads the CLI binary.

### 7. Syncing Clerk users and workspaces locally

In production, Clerk sends webhooks to Inngest Cloud, which calls the API. Locally, Clerk can't reach `localhost`, so signing up doesn't create a row in the `User` table. Until a user and workspace are synced, the app keeps showing the "Create organization" screen.

To sync locally, sign up in the app and create a workspace. Then, with the API and the Inngest dev server running, replay the Clerk events into the dev server ([`server/scripts/sync-clerk.ts`](server/scripts/sync-clerk.ts)):

```bash
cd server
npm run sync:clerk            # lists Clerk users and organizations
npm run sync:clerk -- send <orgId>
```

This sends the same `clerk/user.created` and `clerk/organization.created` events Clerk's webhooks would, so the real sync functions run unchanged.

### 8. Running the tests

Integration tests (Vitest + Supertest) run against a disposable Postgres in Docker, never against the Neon database:

```bash
cd server
npm run db:test   # starts Postgres (5433) and Redis (6380), data kept in memory only
npm test
```

The test run refuses to start unless `DATABASE_URL` points at a local database whose name ends in `_test`. Migrations are applied once per run, and every table (and the test Redis) is emptied before each test. Clerk is replaced by a test double that reads the user ID from an `x-test-user-id` header, so no production code has a test-only path.

---

## Performance

Measured on a seeded dataset of **50,000 tasks and 100,000 comments** (4 workspaces; the benchmark project has 2,307 tasks), using a local Postgres 17 in Docker and autocannon against the real HTTP server on a laptop (Node 24, Windows). Numbers show relative improvement, not production latency.

### Loading screens: before vs after

Before, every screen loaded the whole workspace from one endpoint. After, each screen calls small, purpose-built endpoints.

| Screen | Before | After |
|---|---|---|
| Dashboard | `GET /api/workspaces` full tree: **p50 6.8 s, p97.5 7.2 s, ~76 MB**, 0.1 req/s (1 connection; 10 connections timed out) | `summary` + `projects`: **p50 36 ms + 23 ms, ~81 KB** (10 connections); **5 ms + 7 ms** from the cache (Phase 4) |
| Project task list | same full tree (**~76 MB**) | one page of 50 tasks: **p50 14 ms, p97.5 19 ms, 37 KB**, 678 req/s |
| Task list, page after row 2,000 | n/a (everything was loaded) | **p50 14 ms**: same as page 1 (keyset pagination) |
| Task comments | p50 20 ms (full table scan) | p50 9 ms, 1,057 req/s |

### Database query time (`EXPLAIN ANALYZE`, before → after indexes)

| Query | Before | After | How |
|---|---|---|---|
| Tasks of a project, first page | 5.57 ms | 0.11 ms | index on `(projectId, createdAt, id)`, read backwards; no sort |
| Page after row 2,000 | 5.78 ms | 0.12 ms | keyset condition that seeks straight to the cursor |
| Comments of a task | 6.03 ms | 0.07 ms | index on `(taskId, createdAt, id)` |
| Per-project task counts | 13.19 ms | 5.50 ms | index-only scan on `(projectId, status)` |
| "My open tasks", top 10 | 5.70 ms | 0.07 ms | index on `(assigneeId, dueDate)` |
| Recently updated, top 10 | 29.48 ms | 0.60 ms | index on `updatedAt`, read backwards |

The overdue count is intentionally left as a sequential scan: it matches about a third of all tasks, where an index doesn't help.

**What changed:** the workspace tree was split into screen-shaped endpoints; lists use keyset (cursor) pagination with filters on the server; dashboard numbers are aggregated in SQL; seven indexes were chosen from query plans; responses select only the columns a screen shows. Raw results and query plans are in [`server/bench-results/`](server/bench-results/).

### Caching

The dashboard makes two reads on every load: the **summary** (seven queries) and the **projects list** (projects, members and task counts). Both are cached in Redis per workspace, user and role, for 60 seconds.

| Endpoint (10 connections) | Redis off | Cached | |
|---|---|---|---|
| `GET /api/workspaces/:id/summary` | p50 37 ms, p97.5 52 ms, 265 req/s | **p50 5 ms, p97.5 8 ms, 1,744 req/s** | 6.6× throughput |
| `GET /api/workspaces/:id/projects` (60 KB) | p50 22 ms, p97.5 30 ms, 430 req/s | **p50 7 ms, p97.5 12 ms, 1,233 req/s** | 2.9× throughput |
| `GET /api/workspaces` (not cached: rate-limit cost) | p50 2 ms, 3,940 req/s | p50 3 ms, 3,048 req/s | ≈ 0.3 ms per request |

**Invalidation: versioned keys.** Each workspace has a counter in Redis, and it's part of every cache key (`cache:ws:<id>:v<version>:<view>:<user>:<role>`). Any write that can change a cached view increments the counter:

- task create, update or delete; project create, update or new member;
- Clerk sync: user created, renamed or deleted (for each of their workspaces), workspace updated or deleted, member joined.

One increment makes every cached entry of that workspace, for all users, unreachable; the old entries simply expire. Deleting keys instead would need a scan over every user's entries, and has a race where a slow reader writes old data back right after the delete; with versions, that late write lands under a key nobody reads.

- **Read-your-writes:** the counter is incremented before the write's response is sent, so the next read already misses.
- **Permissions aren't cached:** membership is checked on every request, before the cache. A removed member gets 403 even if an entry exists.
- **The 60 s TTL is a safety net** for a missed or failed invalidation and for time-based values like "overdue".
- **Fail open:** if Redis is down, reads go to Postgres.

The benchmark server gets Redis explicitly per scenario (`6379`, database 1, emptied before each scenario), so results don't depend on the local `.env`. Results: [`bench-results/phase-4.json`](server/bench-results/phase-4.json).

### Reproducing

```bash
cd server
npm run bench:db                 # local Postgres for benchmarks (port 5434)
npm run redis:dev                # Redis for the cached scenarios (port 6379, database 1)
npm run bench:seed               # deterministic 50k tasks / 100k comments (~15 s)
npm run bench -- <label>         # load test → bench-results/<label>.json
npm run bench:explain -- <label> # EXPLAIN ANALYZE of each query → bench-results/explain-<label>.md
```

---

## Security

An audit of the inherited codebase found the issues below. Each was reproduced with a failing integration test **before** the fix, and those tests now run on every change (136 tests in `server/tests/`).

### Access control

| Issue | Impact before the fix | Fix | Test file |
|---|---|---|---|
| Comments readable by task ID (IDOR) | Any signed-in user could read any task's comments, including other workspaces' | Project membership required; 404 for unknown tasks | `authorization.test.ts` |
| Bulk delete checked only the first task | Mixing another project's task ID into the list deleted it | Every task loaded; lead or admin rights required on each project; all-or-nothing | `authorization.test.ts` |
| Project update trusted `workspaceId` from the body | An admin of one workspace could rename or move projects in another | Permission checked against the project's own workspace; `workspaceId` not updatable | `authorization.test.ts` |
| Add-member searched all users by email | Users from other workspaces could be added; responses revealed which emails exist | Lookup limited to the workspace's members; one response for unknown and foreign emails; 409 for duplicates | `authorization.test.ts` |
| Task update passed the request body to the ORM (mass assignment) | Clients could move tasks between projects, rewrite `createdAt`, assign non-members | Allow-listed fields per operation; field-level rules per role | `taskPermissions.test.ts` |
| Team lead not validated on project creation | A user from another workspace could be made lead | Lead must be a workspace member | `validation.test.ts` |

Permission rules live in one module (`server/services/authorization.ts`). Leads and workspace admins manage projects and tasks; members can create, claim and complete their own tasks.

### Input validation and error handling

| Issue | Fix | Test file |
|---|---|---|
| Missing or invalid fields (due date, status, IDs) caused 500 errors or were stored as-is (blank titles, end before start) | Zod schema for every request body and URL parameter; 400 with field-level errors | `validation.test.ts` |
| Error responses leaked internal messages and database codes | Central error handler: expected errors keep their message, anything else returns a generic 500 with a request ID | `validation.test.ts` |
| Any website could call the API from a browser (`Access-Control-Allow-Origin: *`) | CORS limited to the client origin (`APP_URL`) | `hardening.test.ts` |

### Background jobs and data integrity

| Issue | Fix | Test file |
|---|---|---|
| Task titles and descriptions were inserted into email HTML unescaped | All values escaped | `jobs.test.ts` |
| Email links were built from the request's `Origin` header | Links built from the server-side `APP_URL` | `jobs.test.ts` |
| Assignment email could be sent again on job replay; steps were nested | One idempotent step per side effect | `jobs.test.ts` |
| Reminders ignored due-date changes | Reminder cancelled and rescheduled on every due-date change or deletion; checks the current due date before sending | `jobs.test.ts` |
| Custom Clerk roles broke membership sync; replayed webhooks failed | Explicit role mapping (unknown roles get least privilege); idempotent upserts | `jobs.test.ts` |
| Deleting a user deleted every project they led and every workspace they owned | Ownership and project leadership pass to a remaining admin, in one transaction | `hardening.test.ts` |

### Practices

- **Tests can't touch real systems:** the test run refuses any database that isn't a local `*_test` database, and email sending is stubbed globally.
- **Secrets stay out of logs:** request logs keep only method, URL, status and timing; authorization headers and cookies are redacted.
- **Rate limiting:** 300 reads and 60 writes per minute per user (IP address for anonymous requests), shared across API instances through Redis. A sliding-window counter in one Lua script, so the check and the increment are atomic and a burst at a minute boundary can't double the limit. Server-to-server Inngest calls aren't limited. Tested in `rateLimit.test.ts`.

---

## Roadmap

- [x] **Phase 0**: Setup, rebrand, local environment, documentation
- [x] **Phase 1**: Backend in TypeScript (strict); routes → controllers → services layering; central authorization module; typed errors and a central error handler; structured logging with request IDs; task UX fixes and derived project progress
- [x] **Phase 2**: Security audit with test-first fixes (86 integration tests: Vitest + Supertest on disposable Postgres); Zod validation; centralized authorization with task permission rules; safe, replay-proof background jobs; CORS lock-down
- [x] **Phase 3**: Screen-shaped endpoints replacing a 76 MB workspace payload; keyset pagination with server-side filters; seven indexes chosen from `EXPLAIN ANALYZE`; benchmarks on a 50k-task dataset (project task list: 7.2 s → 19 ms p97.5)
- [x] **Phase 4**: Redis: per-user rate limiting (sliding-window counter in Lua); dashboard cache with versioned-key invalidation (summary 265 → 1,744 req/s); both fail open. Task editing
- [ ] **Phase 5**: Real-time task and comment updates with Socket.io, in project-scoped authorized rooms
- [ ] **Phase 6**: Docker Compose (API + Postgres + Redis) and GitHub Actions CI

A changelog of what changed in each phase, and why, is kept in [`CHANGELOG.md`](CHANGELOG.md).
