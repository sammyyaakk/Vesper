// Captures the SQL Prisma sends for each read operation and runs EXPLAIN ANALYZE on it (benchmark database only).
// Usage (from server/): npm run bench:explain -- <label>
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { after } from "../../utils/pagination.js";
import { BENCH_DATABASE_URL, assertBenchDatabase } from "./benchDatabase.js";

const label = process.argv[2] ?? "explain";
assertBenchDatabase(BENCH_DATABASE_URL);

const prisma = new PrismaClient({
    datasourceUrl: BENCH_DATABASE_URL,
    log: [{ emit: "event", level: "query" }],
});
let captured: { query: string; params: string }[] = [];
prisma.$on("query", (event) => captured.push({ query: event.query, params: event.params }));

const USER = "org_bench_main_user_7";
const WORKSPACE = "org_bench_main";

const project = await prisma.project.findFirstOrThrow({
    where: { workspaceId: WORKSPACE, members: { some: { userId: USER } } },
    orderBy: { tasks: { _count: "desc" } },
});
const task = await prisma.task.findFirstOrThrow({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
const deepCursor = await prisma.task.findFirstOrThrow({
    where: { projectId: project.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: 1999,
    select: { id: true, createdAt: true },
});
const projectIds = (await prisma.project.findMany({ where: { workspaceId: WORKSPACE }, select: { id: true } })).map((p) => p.id);
const open = { projectId: { in: projectIds }, status: { not: "DONE" as const } };
const taskPage = { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 51 };

const operations: [string, () => Promise<unknown>][] = [
    ["tasks of a project, page 1", () => prisma.task.findMany({ where: { projectId: project.id }, ...taskPage })],
    ["tasks of a project, after row 2,000 (Prisma cursor)", () => prisma.task.findMany({ where: { projectId: project.id }, ...taskPage, cursor: { id: deepCursor.id }, skip: 1 })],
    ["tasks of a project, after row 2,000 (keyset)", () => prisma.task.findMany({ where: { projectId: project.id, ...after(deepCursor, "desc") }, ...taskPage })],
    ["tasks of a project, assignee = me", () => prisma.task.findMany({ where: { projectId: project.id, assigneeId: USER }, ...taskPage })],
    ["comments of a task, page 1", () => prisma.comment.findMany({ where: { taskId: task.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 51 })],
    ["project members by project (access checks, includes)", () => prisma.projectMember.findMany({ where: { projectId: project.id } })],
    ["projects visible to a member", () => prisma.project.findMany({ where: { workspaceId: WORKSPACE, OR: [{ teamLead: USER }, { members: { some: { userId: USER } } }] } })],
    ["task counts per project (GROUP BY)", () => prisma.task.groupBy({ by: ["projectId", "status"], where: { projectId: { in: projectIds } }, _count: { _all: true } })],
    ["summary: overdue count", () => prisma.task.count({ where: { ...open, dueDate: { lt: new Date() } } })],
    ["summary: my open tasks (count)", () => prisma.task.count({ where: { ...open, assigneeId: USER } })],
    ["summary: my open tasks (top 10 by due date)", () => prisma.task.findMany({ where: { ...open, assigneeId: USER }, orderBy: { dueDate: "asc" }, take: 10 })],
    ["summary: recently updated (top 10)", () => prisma.task.findMany({ where: { projectId: { in: projectIds } }, orderBy: { updatedAt: "desc" }, take: 10 })],
];

const parseParams = (params: string): unknown[] => {
    try {
        // Prisma logs dates as "2026-09-27 17:08:21.511 UTC"
        const loggedDate = /^(\d{4}-\d{2}-\d{2}) ([\d:.]+) UTC$/;
        return (JSON.parse(params) as unknown[]).map((value) => {
            const match = typeof value === "string" ? value.match(loggedDate) : null;
            return match ? new Date(`${match[1]}T${match[2]}Z`) : value;
        });
    } catch {
        return [];
    }
};

const lines: string[] = [`# EXPLAIN ANALYZE: ${label} (${new Date().toISOString()})`, ""];
const summary: { operation: string; plan: string; ms: number }[] = [];

for (const [name, run] of operations) {
    captured = [];
    await run();
    const main = captured.at(-1);
    if (!main) continue;

    const rows = await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN (ANALYZE, BUFFERS) ${main.query}`, ...parseParams(main.params));
    const plan = rows.map((row) => row["QUERY PLAN"]);
    const executionMs = Number(plan.find((line) => line.startsWith("Execution Time"))?.match(/[\d.]+/)?.[0] ?? NaN);
    const scans = [...new Set(plan.map((line) => line.match(/(Seq Scan|Index Only Scan Backward|Index Only Scan|Index Scan Backward|Index Scan|Bitmap Heap Scan|Bitmap Index Scan) (?:using (\S+) )?on "?(\w+)"?/)).filter(Boolean).map((m) => `${m![1]}${m![2] ? ` (${m![2]})` : ""} on ${m![3]}`))];

    summary.push({ operation: name, plan: scans.join(", "), ms: executionMs });
    lines.push(`## ${name}`, "", "```sql", main.query, "```", "", "```", ...plan, "```", "");
}

console.table(summary);
mkdirSync("bench-results", { recursive: true });
writeFileSync(`bench-results/explain-${label}.md`, lines.join("\n"));
writeFileSync(`bench-results/explain-${label}.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(`Saved bench-results/explain-${label}.md`);
await prisma.$disconnect();
