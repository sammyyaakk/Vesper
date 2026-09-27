# Vesper

Vesper is a multi-tenant project management app. Teams work inside **workspaces**, which contain **projects**, which contain **tasks** with **comments**. Members are assigned tasks, get an email when that happens, and get a reminder when a task is due.

> **Status:** under active development. The current focus is hardening the backend (TypeScript, authorization, validation and tests), then performance, caching and real-time updates. See [Roadmap](#roadmap).

---

## Features

- Sign-in with email or Google; workspaces are Clerk Organizations with **Admin** / **Member** roles
- Projects with status, priority, dates, a team lead and project members; progress calculated from completed tasks
- Tasks with type, priority, status, optional assignee and a required due date; comments on tasks
- Dashboard, project analytics and calendar views; light/dark theme
- Background jobs: Clerk → database sync, task-assignment email, due-date reminder

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Redux Toolkit, React Router, Axios, Recharts |
| Backend | Node.js, Express 5, TypeScript (strict) |
| Logging | [Pino](https://getpino.io) structured JSON logs with per-request IDs |
| Database | PostgreSQL on [Neon](https://neon.tech), via Prisma 6 and the Neon serverless driver adapter |
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
│  protect → routes →      │───────►│              │
│  controllers → services  │ events └──────────────┘
│  (authorization) →       │   (app/task.assigned)
│  errorHandler            │
│  /api/inngest: functions │
└────────────┬─────────────┘
             │ Prisma
             ▼
┌──────────────────────────┐        ┌──────────────┐
│  PostgreSQL (Neon)       │        │  SMTP relay  │◄── task-assignment and
└──────────────────────────┘        └──────────────┘    reminder emails
```

**Request flow.** The client gets a short-lived session JWT from Clerk and sends it with each API call. `requestLogger` assigns a request ID (returned as `X-Request-Id`). `clerkMiddleware()` verifies the token, and `protect` rejects requests with no signed-in user.

**Server layers.** *Controllers* only handle HTTP: they read the user, body and params, call a service, and send the response. *Services* hold the business logic and data access (Prisma). Every permission check lives in one module, `services/authorization.ts` (`requireWorkspaceRole`, `requireProjectLead`, `requireProjectMember`, …).

**Errors.** Services throw `AppError`s (400/403/404/…). Express 5 forwards them to a single `errorHandler`, which returns the status and message. Unexpected errors are logged with their stack and the request ID; the client only gets `500 {"message":"Internal server error","requestId":"…"}`.

**Identity sync.** Users, workspaces and workspace memberships live in Clerk. Clerk sends a webhook for each change, Inngest turns it into an event (`clerk/user.created`, `clerk/organization.created`, …), and an Inngest function copies it into Postgres. That keeps relational data (projects, tasks) joinable with users and workspaces.

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

All routes except `/api/inngest` require a Clerk session.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/workspaces` | Workspaces for the current user (with projects, tasks, members) |
| POST | `/api/projects` | Create a project (workspace admin) |
| PUT | `/api/projects` | Update a project |
| POST | `/api/projects/:projectId/addMember` | Add a workspace member to a project |
| POST | `/api/tasks` | Create a task |
| PUT | `/api/tasks/:id` | Update a task |
| POST | `/api/tasks/delete` | Delete tasks by ID |
| POST | `/api/comments` | Add a comment to a task |
| GET | `/api/comments/:taskId` | List a task's comments |
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
  services/             business logic and data access
    authorization.ts    all permission checks
  middlewares/          auth guard, request logger, error handler
  inngest/              background functions (Clerk sync, emails)
  configs/              Prisma client, logger, mailer
  utils/AppError.ts     typed HTTP errors
  scripts/              dev tooling (sync:clerk)
  prisma/               schema and migrations
```

Server scripts (from `server/`): `npm run dev` (watch mode), `npm run typecheck`, `npm run build` (compile to `dist/`), `npm start` (run the build), `npm run sync:clerk`.

---

## Running locally

### Prerequisites

- Node.js 20+ (developed on Node 24)
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
npm run db:test   # starts Postgres on localhost:5433 (data kept in memory only)
npm test
```

The test run refuses to start unless `DATABASE_URL` points at a local database whose name ends in `_test`. Migrations are applied once per run, and every table is emptied before each test. Clerk is replaced by a test double that reads the user ID from an `x-test-user-id` header, so no production code has a test-only path.

---

## Roadmap

- [x] **Phase 0**: Setup, rebrand, local environment, documentation
- [x] **Phase 1**: Backend in TypeScript (strict); routes → controllers → services layering; central authorization module; typed errors and a central error handler; structured logging with request IDs; task UX fixes and derived project progress
- [ ] **Phase 2**: Authorization and input-validation audit with integration tests (Vitest + Supertest), Zod request schemas, CORS lock-down, safe email rendering
- [ ] **Phase 3**: Focused, cursor-paginated endpoints; indexes chosen from query patterns; latency benchmarks on a 50k-task dataset
- [ ] **Phase 4**: Redis caching with explicit invalidation; per-user rate limiting
- [ ] **Phase 5**: Real-time task and comment updates with Socket.io, in project-scoped authorized rooms
- [ ] **Phase 6**: Docker Compose (API + Postgres + Redis) and GitHub Actions CI

A changelog of what changed in each phase, and why, is kept in [`CHANGELOG.md`](CHANGELOG.md).
