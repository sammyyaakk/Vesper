# Vesper

Vesper is a multi-tenant project management app. Teams work inside **workspaces**, which contain **projects**, which contain **tasks** with **comments**. Members are assigned tasks, get an email when that happens, and get a reminder when a task is due.

> **Status:** under active development. The current focus is hardening the backend (TypeScript, authorization, validation and tests), then performance, caching and real-time updates. See [Roadmap](#roadmap).

---

## Features

- Sign-in with email or Google; workspaces are Clerk Organizations with **Admin** / **Member** roles
- Projects with status, priority, dates, a team lead and project members; progress calculated from completed tasks
- Tasks with type, priority, status, optional assignee and a required due date; comments on tasks
- Members can claim unassigned tasks and complete their own; leads and workspace admins manage everything
- Due-date reminders that follow due-date changes (to the assignee, or the project lead if unassigned)
- Dashboard, project analytics and calendar views; light/dark theme
- Background jobs: Clerk → database sync, task-assignment email, due-date reminder

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Redux Toolkit, React Router, Axios, Recharts |
| Backend | Node.js, Express 5, TypeScript (strict) |
| Logging | [Pino](https://getpino.io) structured JSON logs with per-request IDs |
| Validation | [Zod](https://zod.dev) schemas for every request body and URL parameter |
| Testing | Vitest + Supertest integration tests against a disposable Postgres in Docker |
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
  schemas/              Zod request schemas (the source of input types)
  services/             business logic and data access
    authorization.ts    all permission checks
  middlewares/          auth guard, request logger, error handler
  inngest/              background functions: index.ts wires triggers, handlers.ts holds the logic
  emails/               email templates (escaped)
  configs/              Prisma client, logger, mailer, app URL
  tests/                integration tests, factories, test setup
  utils/AppError.ts     typed HTTP errors
  scripts/              dev tooling (sync:clerk)
  prisma/               schema and migrations
```

Server scripts (from `server/`): `npm run dev` (watch mode), `npm test`, `npm run typecheck`, `npm run build` (compile to `dist/`), `npm start` (run the build), `npm run db:test`, `npm run sync:clerk`.

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
| | `APP_URL` | Client URL used in email links, e.g. `http://localhost:5173` (required in production) |
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

## Security

An audit of the inherited codebase found the issues below. Each was reproduced with a failing integration test **before** the fix, and those tests now run on every change (86 tests in `server/tests/`).

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
- **Rate limiting** is planned for Phase 4.

---

## Roadmap

- [x] **Phase 0**: Setup, rebrand, local environment, documentation
- [x] **Phase 1**: Backend in TypeScript (strict); routes → controllers → services layering; central authorization module; typed errors and a central error handler; structured logging with request IDs; task UX fixes and derived project progress
- [x] **Phase 2**: Security audit with test-first fixes (86 integration tests: Vitest + Supertest on disposable Postgres); Zod validation; centralized authorization with task permission rules; safe, replay-proof background jobs; CORS lock-down
- [ ] **Phase 3**: Focused, cursor-paginated endpoints; indexes chosen from query patterns; latency benchmarks on a 50k-task dataset
- [ ] **Phase 4**: Redis caching with explicit invalidation; per-user rate limiting
- [ ] **Phase 5**: Real-time task and comment updates with Socket.io, in project-scoped authorized rooms
- [ ] **Phase 6**: Docker Compose (API + Postgres + Redis) and GitHub Actions CI

A changelog of what changed in each phase, and why, is kept in [`CHANGELOG.md`](CHANGELOG.md).
