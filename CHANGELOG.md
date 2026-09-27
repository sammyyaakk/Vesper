# Changelog

Each phase lists what changed and why.

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
