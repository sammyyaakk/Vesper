# Changelog

Each phase lists what changed and why.

## Phase 3: Performance

Measured on a seeded 50,000-task / 100,000-comment dataset. See README → Performance for the tables.

### Benchmarking
- Local benchmark database (`compose.bench.yaml`, port 5434) with a deterministic seed script (`npm run bench:seed`).
- `npm run bench -- <label>`: autocannon against the real HTTP server, a fresh server per scenario, results saved to `server/bench-results/`. Authentication in benchmarks is swapped by a Node module hook in the benchmark process only; the app code is unchanged.
- `npm run bench:explain -- <label>`: captures the SQL Prisma sends and saves `EXPLAIN ANALYZE` plans.

### API
- The workspace tree endpoint (one ~76 MB response, ~7 s) is replaced by screen-shaped endpoints: workspace list, workspace detail, projects with task counts, dashboard summary, project detail, paginated tasks with server-side filters, task detail, paginated comments, project stats, project calendar.
- Keyset (cursor) pagination on `(createdAt, id)` with an opaque cursor. Written so Postgres seeks directly to the cursor: the page after row 2,000 costs the same as page 1.
- Aggregates (counts, overdue, per-project progress) are computed in SQL, not in the browser.
- Visibility: workspace admins see every project; members see the projects they belong to (the old tree exposed every project's tasks to every member).
- Removed: the workspace tree query and `GET /api/comments/:taskId` (replaced by `GET /api/tasks/:id/comments`).

### Database
- Seven indexes chosen from query plans: `Task(projectId, createdAt, id)`, `Task(projectId, status)`, `Task(assigneeId, dueDate)`, `Task(updatedAt)`, `Comment(taskId, createdAt, id)`, `ProjectMember(projectId)`, `Project(workspaceId)`. List queries went from 5–29 ms to 0.07–0.6 ms.
- The calendar selects only the columns it displays (response 252 KB → 126 KB).

### Frontend
- Redux holds the workspace list, current workspace, projects with counts and the dashboard summary; after a change, the affected counts and lists are reloaded instead of patched locally.
- Task list: 50 per page with "Load more"; filters (including "Assigned to me" and "Unassigned") run on the server.
- Analytics and calendar tabs use the new stats and calendar endpoints.
- Task comments are paginated, and polling fetches only comments newer than the last one shown.

### Fixed along the way
- Dashboard numbers: "Completed Projects" showed a task count, "My Tasks" counted the workspace owner's tasks, "Overdue" included finished tasks.
- Task page and project settings crashed for projects without a start or end date.
- Task filter dropdowns didn't reset visually.

## Phase 2: Security and validation (test-first)

Every issue was first reproduced by an integration test that failed on the existing code, then fixed. 86 tests now guard the behaviour. See README → Security for the full list.

### Test infrastructure
- Vitest + Supertest against a disposable Postgres in Docker (`compose.test.yaml`, in-memory storage).
- The test run refuses any database that isn't a local `*_test` database; migrations are applied per run and tables emptied before each test.
- Clerk is replaced in the test process only (a header selects the user), so production code has no test-only path; event publishing and email sending are stubbed globally.
- `app.ts` (the Express app) is separated from `server.ts` (`listen`); the Neon driver adapter is used only for Neon URLs.

### Validation
- Zod schemas for every request body and URL parameter (`server/schemas/`); controllers parse input into typed values, and service input types are derived from the schemas.
- Bad input returns 400 with field-level errors instead of 500s or silently stored bad data (missing due dates, blank titles, end date before start, invalid enums and IDs).

### Access control
- Fixed: reading any task's comments by ID; bulk delete across projects; updating or moving another workspace's project; adding users from other workspaces; account enumeration through add-member; a team lead from outside the workspace; mass assignment on task updates.
- Authorization always uses the resource's owner as stored in the database, never tenant IDs from the request.
- Task permission rules: leads and workspace admins manage tasks; members create unassigned or self-assigned tasks, claim unassigned tasks, unassign themselves and change the status of their own tasks. "Assign to me" and "Unassign me" in the task row menu.
- Database unique-constraint violations return 409.

### Background jobs
- Job logic lives in plain handler functions, tested with a fake Inngest `step`.
- Emails escape all user-provided text; links come from the server-side `APP_URL`, not the request's `Origin` header.
- Each side effect runs in exactly one step, so replays can't duplicate emails; deleted or reassigned tasks are skipped.
- Reminders are a separate function, cancelled and rescheduled when the due date changes or the task is deleted, and they remind the project lead for unassigned tasks.
- Clerk sync is idempotent (upserts); Clerk roles are mapped explicitly, with unknown roles getting the least privilege.
- Event publishing is best-effort: a failed publish is logged and doesn't fail the request.

### Hardening
- CORS is limited to the client origin (`APP_URL`).
- Deleting a user no longer deletes their projects or owned workspaces: ownership and project leadership pass to a remaining admin (or a promoted member), in one transaction.

### New configuration
- `APP_URL` (server): the client's public URL, used for email links and CORS; required in production.

## Phase 1: TypeScript foundation

The goal was a typed, layered backend **without changing behaviour**, except for the listed product fixes. Known security bugs were deliberately **not** fixed here: Phase 2 fixes each one with a failing test first, and their locations are marked `TODO(phase-2) #n`.

### TypeScript
- The whole server is strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`), migrated file by file with `allowJs` so the app ran after every step. `allowJs` is now off.
- `tsx watch` for development (replaces nodemon); `tsc` builds to `dist/` for production; `npm run typecheck` is the gate.
- Strict null checks exposed real bugs: a property typo that disabled the duplicate-member check, null crashes on unknown IDs, and a string written into an enum column. They're recorded for Phase 2.

### Architecture
- **Layers:** routes → controllers (HTTP only) → services (business logic, Prisma) → database. Controllers shrank from ~330 to ~44 lines.
- **Authorization module:** every permission check lives in `services/authorization.ts` (`requireWorkspace`, `requireWorkspaceRole`, `requireProject`, `requireProjectLead`, `requireProjectMember`), replacing seven inline copies. This is the single place Phase 2 hardens and tests.
- **Errors:** `AppError` plus one error-handling middleware (Express 5 forwards async errors). 500 responses no longer leak internal messages. Malformed JSON gets a JSON 400.

### Observability
- Pino structured logs; one line per request with method, URL, status and duration; a request ID in `X-Request-Id` and in 500 bodies.
- Authorization headers and cookies are never logged; emails are no longer logged with recipients and bodies.

### Data model
- camelCase field names in code via Prisma `@map` (`teamLead`, `dueDate`, `startDate`, `endDate`, `imageUrl`). No columns were renamed; the migration SQL was reviewed first.
- **Optional task assignee:** tasks can be unassigned; deleting a user now leaves their tasks unassigned instead of deleting them (`ON DELETE SET NULL`).
- **Project progress is derived** from completed tasks (done ÷ total) instead of a manually set number. The `progress` column and slider are gone.
- Data migration fixing users stored with the name `"null null"`.

### Product fixes
- **Task deletion:** an always-visible Delete button with a count, a ⋮ menu on each row, larger checkboxes, select-all over the visible tasks, and the selection cleared after deleting (previously a stale selection re-sent deleted IDs → "Task not found").
- **Create task:** required fields are marked, and Create is disabled until Title and Due Date are filled; "Assign to me".
- The "In Progress" stat no longer counts To Do tasks.
- The Inngest function `sendBookingConfirmationEmail` (a tutorial leftover) is now `sendTaskAssignmentEmail`.

### Found in this phase, scheduled for Phase 2
- Custom Clerk role names break the member sync.
- The assignment-email job crashes and retries if its task was deleted.
- Deleting a user deletes every project they lead (cascade from the team lead).
- Task permission rules for self-assignment: members can claim unassigned tasks and update their own tasks' status; admins get lead rights.

## Phase 0: Setup and rebrand

### Repository and configuration
- **Secrets kept out of git.** The original `.gitignore` only ignored `node_modules`, so `.env` files with real credentials would have been committed. It now ignores `.env` / `.env.*` and keeps committed `.env.example` templates (config lives in the environment; the repo documents which variables are needed).
- **`.gitattributes`** stores text files with LF line endings, so Windows checkouts don't produce whole-file line-ending diffs.

### Build reproducibility
- **Pinned the Prisma CLI** (`prisma@6.18.0`, matching `@prisma/client`). It wasn't a dependency, so `npx prisma generate` fetched the newest Prisma, a pre-release with a different CLI, and `npm install` failed. Every tool a build runs should be declared and locked.
- **Initial migration** (`prisma/migrations/…_init`) so every database is created from versioned SQL instead of an ad-hoc schema push.
- **Pinned the Inngest dev server** to `1.13.7`; newer releases reject the Inngest SDK version in use.

### Rebrand
- App title, meta description and favicon; package names `vesper-client` / `vesper-server`; Inngest app ID `vesper` (renamed before any deployment, while the ID isn't yet a contract with Inngest Cloud).
- Removed the Vite template README and unused dummy data and images.

### Local development
- **`npm run sync:clerk`** (`server/scripts/sync-clerk.js`) replays Clerk users and organizations into the local Inngest dev server as `clerk/user.created` / `clerk/organization.created` events. Clerk's webhooks can't reach localhost, so without it a fresh local setup never syncs users and gets stuck on "Create organization". The real sync functions run unchanged; only the delivery differs.

### Documentation
- README: architecture, data model, API surface, local setup, roadmap.

### Found during the baseline run (fixed in later phases)
- Creating a task without a due date returns a 500 error.
- Users who sign up by email are stored with the name `"null null"`.
- The "In Progress" stat also counts `TODO` tasks.
- The assignment email is sent outside an Inngest step, so it can be sent again whenever the function resumes.
- A step is nested inside another step in the reminder function.
