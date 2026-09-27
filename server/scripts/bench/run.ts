// Runs HTTP load against the real app on the seeded benchmark database.
// Usage (from server/): npm run bench -- <label>      e.g. npm run bench -- baseline
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import autocannon from "autocannon";
import { BENCH_DATABASE_URL, BENCH_USER_HEADER, assertBenchDatabase } from "./benchDatabase.js";

const label = process.argv[2] ?? "run";
const PORT = 5055;
const BASE = `http://localhost:${PORT}`;
const BENCH_USER = "org_bench_main_user_7";

interface Scenario {
    name: string;
    path: string;
    connections: number;
    durationSeconds: number;
    timeoutSeconds: number;
}

assertBenchDatabase(BENCH_DATABASE_URL);
process.env.DATABASE_URL = BENCH_DATABASE_URL;
const { default: prisma } = await import("../../configs/prisma.js");

const project = await prisma.project.findFirstOrThrow({
    where: { workspaceId: "org_bench_main", members: { some: { userId: BENCH_USER } } },
    orderBy: { tasks: { _count: "desc" } },
});
const task = await prisma.task.findFirstOrThrow({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
// Cursor for the page after row 2,000 of the project's task list (same ordering as the endpoint)
const deepCursor = await prisma.task.findFirstOrThrow({
    where: { projectId: project.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: 1999,
    select: { id: true },
});
const dataset = {
    tasks: await prisma.task.count(),
    comments: await prisma.comment.count(),
    benchProjectTasks: await prisma.task.count({ where: { projectId: project.id } }),
};
await prisma.$disconnect();

const standard = { connections: 10, durationSeconds: 15, timeoutSeconds: 10 };
const scenarios: Scenario[] = [
    // The legacy endpoint returns the whole workspace (~77 MB); 10 connections time out, so it runs with 1
    { name: "GET /api/workspaces (full tree)", path: "/api/workspaces", connections: 1, durationSeconds: 30, timeoutSeconds: 60 },
    { name: "GET /api/comments/:taskId", path: `/api/comments/${task.id}`, ...standard },
    { name: "GET /api/workspaces/:id/projects", path: "/api/workspaces/org_bench_main/projects", ...standard },
    { name: "GET /api/workspaces/:id/summary", path: "/api/workspaces/org_bench_main/summary", ...standard },
    { name: "GET /api/projects/:id/tasks (page 1)", path: `/api/projects/${project.id}/tasks?limit=50`, ...standard },
    { name: "GET /api/projects/:id/tasks (after row 2,000)", path: `/api/projects/${project.id}/tasks?limit=50&cursor=${deepCursor.id}`, ...standard },
    { name: "GET /api/projects/:id/tasks?assignee=me", path: `/api/projects/${project.id}/tasks?limit=50&assignee=me`, ...standard },
    { name: "GET /api/tasks/:id/comments", path: `/api/tasks/${task.id}/comments?limit=50`, ...standard },
];

const startServer = async () => {
    const server = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/bench/server.ts"], {
        env: { ...process.env, BENCH_PORT: String(PORT) },
        stdio: ["ignore", "ignore", "inherit"],
    });
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            if ((await fetch(`${BASE}/`)).ok) return server;
        } catch {
            // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    server.kill();
    throw new Error("bench server didn't start");
};

const stopServer = (server: ChildProcess) =>
    new Promise<void>((resolve) => {
        server.once("exit", () => resolve());
        server.kill();
    });

const results: Record<string, unknown>[] = [];
for (const scenario of scenarios) {
    // A fresh server per scenario, so a slow scenario can't leave work behind that skews the next one
    const server = await startServer();
    try {
        const headers = { [BENCH_USER_HEADER]: BENCH_USER };
        const warmup = await fetch(`${BASE}${scenario.path}`, { headers });
        if (!warmup.ok) throw new Error(`${scenario.name} returned ${warmup.status}`);
        await warmup.arrayBuffer();

        const result = await autocannon({
            url: `${BASE}${scenario.path}`,
            headers,
            connections: scenario.connections,
            duration: scenario.durationSeconds,
            timeout: scenario.timeoutSeconds,
        });
        const summary = {
            scenario: scenario.name,
            connections: scenario.connections,
            p50_ms: result.latency.p50,
            p97_5_ms: result.latency.p97_5,
            p99_ms: result.latency.p99,
            mean_ms: Number(result.latency.average.toFixed(1)),
            req_per_s: Number(result.requests.average.toFixed(1)),
            kb_per_response: Number((result.throughput.total / Math.max(result.requests.total, 1) / 1024).toFixed(1)),
            requests: result.requests.total,
            non2xx: result.non2xx,
            errors: result.errors,
            timeouts: result.timeouts,
        };
        results.push(summary);
        console.log(summary);
    } finally {
        await stopServer(server);
    }
}

mkdirSync("bench-results", { recursive: true });
const report = { label, date: new Date().toISOString(), node: process.version, benchUser: BENCH_USER, dataset, scenarios, results };
writeFileSync(`bench-results/${label}.json`, JSON.stringify(report, null, 2) + "\n");
console.table(results.map(({ scenario, connections, p50_ms, p97_5_ms, p99_ms, req_per_s, kb_per_response, errors }) => ({ scenario, connections, p50_ms, p97_5_ms, p99_ms, req_per_s, kb_per_response, errors })));
console.log(`Saved bench-results/${label}.json`);
process.exit(0);
