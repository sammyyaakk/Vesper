// Seeds the local benchmark database with a realistic volume: ~50k tasks and ~100k comments.
// Usage (from server/): npm run bench:db && npm run bench:seed
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { BENCH_DATABASE_URL, assertBenchDatabase } from "./benchDatabase.js";

assertBenchDatabase(BENCH_DATABASE_URL);
process.env.DATABASE_URL = BENCH_DATABASE_URL;
process.env.DIRECT_URL = BENCH_DATABASE_URL;

execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });

const { default: prisma } = await import("../../configs/prisma.js");
const { Priority, TaskStatus, TaskType } = await import("@prisma/client");

// Deterministic PRNG so every seed produces the same data (comparable benchmark runs)
let state = 42;
const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const words = "plan design review deploy test fix refactor migrate document measure onboard audit sync release ship".split(" ");
const sentence = (length: number) => Array.from({ length }, () => pick(words)).join(" ");
const DAY = 86_400_000;

const TENANTS = [
    { id: "org_bench_main", users: 50, projects: 20, tasks: 45_000 },
    { id: "org_bench_2", users: 10, projects: 3, tasks: 2_000 },
    { id: "org_bench_3", users: 10, projects: 3, tasks: 2_000 },
    { id: "org_bench_4", users: 5, projects: 2, tasks: 1_000 },
];
const COMMENTS_PER_TASK = 2;
const CHUNK = 5_000;

const insertInChunks = async <T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
};

await prisma.$executeRawUnsafe(
    'TRUNCATE "Comment", "Task", "ProjectMember", "Project", "WorkspaceMember", "Workspace", "User" RESTART IDENTITY CASCADE',
);

const started = Date.now();
let totalTasks = 0;
let totalComments = 0;

for (const tenant of TENANTS) {
    const users = Array.from({ length: tenant.users }, (_, i) => ({
        id: `${tenant.id}_user_${i}`,
        name: `User ${i} (${tenant.id})`,
        email: `user${i}@${tenant.id}.bench`,
    }));
    const [owner] = users;
    await prisma.user.createMany({ data: users });
    await prisma.workspace.create({ data: { id: tenant.id, name: tenant.id, slug: tenant.id, ownerId: owner!.id } });
    await prisma.workspaceMember.createMany({
        data: users.map((user, i) => ({ userId: user.id, workspaceId: tenant.id, role: i < 5 ? "ADMIN" : "MEMBER" })),
    });

    const projects = Array.from({ length: tenant.projects }, (_, i) => {
        const memberIds = users.filter(() => random() < 0.5).map((user) => user.id);
        const teamLead = pick(users).id;
        return { id: randomUUID(), name: `Project ${i}`, workspaceId: tenant.id, teamLead, members: [...new Set([teamLead, ...memberIds])] };
    });
    await prisma.project.createMany({ data: projects.map(({ members: _members, ...project }) => project) });
    await prisma.projectMember.createMany({
        data: projects.flatMap((project) => project.members.map((userId) => ({ projectId: project.id, userId }))),
    });

    const tasks = Array.from({ length: tenant.tasks }, () => {
        const project = pick(projects);
        return {
            id: randomUUID(),
            projectId: project.id,
            title: sentence(4 + Math.floor(random() * 6)),
            description: sentence(10 + Math.floor(random() * 40)),
            status: pick(Object.values(TaskStatus)),
            type: pick(Object.values(TaskType)),
            priority: pick(Object.values(Priority)),
            assigneeId: random() < 0.1 ? null : pick(project.members),
            dueDate: new Date(Date.now() + Math.floor((random() - 0.5) * 180) * DAY),
            createdAt: new Date(Date.now() - Math.floor(random() * 365) * DAY),
            members: project.members,
        };
    });
    await insertInChunks(tasks, (chunk) => prisma.task.createMany({ data: chunk.map(({ members: _members, ...task }) => task) }));

    const comments = tasks.flatMap((task) =>
        Array.from({ length: COMMENTS_PER_TASK }, () => ({
            taskId: task.id,
            userId: pick(task.members),
            content: sentence(5 + Math.floor(random() * 20)),
            createdAt: new Date(task.createdAt.getTime() + Math.floor(random() * 30) * DAY),
        })),
    );
    await insertInChunks(comments, (chunk) => prisma.comment.createMany({ data: chunk }));

    totalTasks += tasks.length;
    totalComments += comments.length;
    console.log(`${tenant.id}: ${users.length} users, ${projects.length} projects, ${tasks.length} tasks, ${comments.length} comments`);
}

await prisma.$executeRawUnsafe("ANALYZE");
console.log(`Seeded ${totalTasks} tasks and ${totalComments} comments in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(0);
