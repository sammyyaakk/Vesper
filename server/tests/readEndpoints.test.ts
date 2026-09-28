import { describe, expect, it } from "vitest";
import { as } from "./helpers/api.js";
import { createComment, createProject, createTask, createTeam, createUser, createWorkspace } from "./helpers/factories.js";

const DAY = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);
const createOtherTenant = async () => {
    const owner = await createUser({ name: "Other owner" });
    const workspace = await createWorkspace(owner.id);
    return { owner, workspace };
};

describe("GET /api/workspaces/:workspaceId", () => {
    it("returns the workspace, its members and the caller's role", async () => {
        const { admin, member, workspace } = await createTeam();

        const res = await as(member.id).get(`/api/workspaces/${workspace.id}`);

        expect(res.status).toBe(200);
        expect(res.body.workspace.id).toBe(workspace.id);
        expect(res.body.workspace.members).toHaveLength(4);
        expect(res.body.role).toBe("MEMBER");
        expect((await as(admin.id).get(`/api/workspaces/${workspace.id}`)).body.role).toBe("ADMIN");
    });

    it("refuses someone from another workspace", async () => {
        const { workspace } = await createTeam();
        const other = await createOtherTenant();
        const res = await as(other.owner.id).get(`/api/workspaces/${workspace.id}`);
        expect(res.status).toBe(403);
    });
});

describe("GET /api/workspaces/:workspaceId/projects", () => {
    it("gives members only their projects, admins all, each with task counts", async () => {
        const { admin, lead, member, workspace, project } = await createTeam();
        const hidden = await createProject(workspace.id, lead.id);
        await createTask(project.id, { status: "DONE" });
        await createTask(project.id, { status: "IN_PROGRESS" });
        await createTask(project.id);

        const asMember = await as(member.id).get(`/api/workspaces/${workspace.id}/projects`);
        const asAdmin = await as(admin.id).get(`/api/workspaces/${workspace.id}/projects`);

        expect(asMember.status).toBe(200);
        expect(asMember.body.projects.map((p: { id: string }) => p.id)).toEqual([project.id]);
        expect(asMember.body.projects[0].taskCounts).toEqual({ total: 3, todo: 1, inProgress: 1, done: 1 });
        expect(asAdmin.body.projects.map((p: { id: string }) => p.id).sort()).toEqual([project.id, hidden.id].sort());
    });
});

describe("GET /api/workspaces/:workspaceId/summary", () => {
    it("counts only projects the caller can access, computed by the database", async () => {
        const { admin, lead, member, workspace, project } = await createTeam();
        const hidden = await createProject(workspace.id, lead.id);
        await createTask(project.id, { assigneeId: member.id, dueDate: daysFromNow(-2) });
        await createTask(project.id, { assigneeId: member.id, status: "DONE", dueDate: daysFromNow(-2) });
        await createTask(project.id, { status: "IN_PROGRESS" });
        await createTask(hidden.id, { dueDate: daysFromNow(-1) });

        const res = await as(member.id).get(`/api/workspaces/${workspace.id}/summary`);

        expect(res.status).toBe(200);
        expect(res.body.tasks).toEqual({ total: 3, todo: 1, inProgress: 1, done: 1, overdue: 1, mine: 1 });
        expect(res.body.projects.total).toBe(1);
        expect(res.body.myTasks.map((t: { assigneeId: string }) => t.assigneeId)).toEqual([member.id]);
        expect(res.body.overdueTasks).toHaveLength(1);

        const asAdmin = await as(admin.id).get(`/api/workspaces/${workspace.id}/summary`);
        expect(asAdmin.body.tasks.total).toBe(4);
        expect(asAdmin.body.projects.total).toBe(2);
    });
});

describe("GET /api/projects/:projectId/tasks (cursor pagination)", () => {
    const seedTasks = async (projectId: string, count: number) => {
        const tasks = [];
        for (let i = 0; i < count; i++) {
            tasks.push(await createTask(projectId, { title: `T${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) }));
        }
        return tasks;
    };

    it("pages through every task exactly once, newest first", async () => {
        const { member, project } = await createTeam();
        const tasks = await seedTasks(project.id, 7);

        const seen: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
            const res = await as(member.id).get(`/api/projects/${project.id}/tasks?limit=3${cursor ? `&cursor=${cursor}` : ""}`);
            expect(res.status).toBe(200);
            seen.push(...res.body.tasks.map((t: { id: string }) => t.id));
            cursor = res.body.nextCursor;
            pages++;
        } while (cursor && pages < 10);

        expect(pages).toBe(3);
        expect(seen).toEqual([...tasks].reverse().map((t) => t.id));
    });

    it("doesn't duplicate or skip when a task is created between pages", async () => {
        const { member, project } = await createTeam();
        const tasks = await seedTasks(project.id, 6);

        const first = await as(member.id).get(`/api/projects/${project.id}/tasks?limit=3`);
        await createTask(project.id, { title: "Newest", createdAt: new Date(Date.UTC(2026, 0, 2)) });
        const second = await as(member.id).get(`/api/projects/${project.id}/tasks?limit=3&cursor=${first.body.nextCursor}`);

        const ids = [...first.body.tasks, ...second.body.tasks].map((t: { id: string }) => t.id);
        expect(ids).toEqual([...tasks].reverse().map((t) => t.id));
        expect(second.body.nextCursor).toBeNull();
    });

    it("pages correctly through tasks created in the same millisecond", async () => {
        const { member, project } = await createTeam();
        const sameInstant = new Date(Date.UTC(2026, 0, 1));
        const ids = [];
        for (let i = 0; i < 5; i++) ids.push((await createTask(project.id, { createdAt: sameInstant })).id);

        const seen: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
            const res = await as(member.id).get(`/api/projects/${project.id}/tasks?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
            seen.push(...res.body.tasks.map((t: { id: string }) => t.id));
            cursor = res.body.nextCursor;
            pages++;
        } while (cursor && pages < 10);

        expect(seen).toHaveLength(5);
        expect(new Set(seen)).toEqual(new Set(ids));
    });

    it("filters on the server by status and assignee", async () => {
        const { member, lead, project } = await createTeam();
        await createTask(project.id, { status: "DONE", assigneeId: member.id });
        await createTask(project.id, { status: "TODO", assigneeId: member.id });
        await createTask(project.id, { status: "TODO", assigneeId: lead.id });
        await createTask(project.id, { status: "TODO" });

        const done = await as(member.id).get(`/api/projects/${project.id}/tasks?status=DONE`);
        const mine = await as(member.id).get(`/api/projects/${project.id}/tasks?assignee=me`);
        const unassigned = await as(member.id).get(`/api/projects/${project.id}/tasks?assignee=none`);

        expect(done.body.tasks).toHaveLength(1);
        expect(mine.body.tasks).toHaveLength(2);
        expect(unassigned.body.tasks).toHaveLength(1);
    });

    it("rejects an out-of-range limit and a malformed cursor", async () => {
        const { member, project } = await createTeam();
        expect((await as(member.id).get(`/api/projects/${project.id}/tasks?limit=1000`)).status).toBe(400);
        expect((await as(member.id).get(`/api/projects/${project.id}/tasks?cursor=abc`)).status).toBe(400);
    });

    it("refuses workspace members who aren't on the project", async () => {
        const { outsider, project } = await createTeam();
        const res = await as(outsider.id).get(`/api/projects/${project.id}/tasks`);
        expect(res.status).toBe(403);
    });
});

describe("GET /api/projects/:projectId and /api/tasks/:taskId", () => {
    it("returns a project with members and task counts", async () => {
        const { member, project } = await createTeam();
        await createTask(project.id, { status: "DONE" });

        const res = await as(member.id).get(`/api/projects/${project.id}`);

        expect(res.status).toBe(200);
        expect(res.body.project.taskCounts).toEqual({ total: 1, todo: 0, inProgress: 0, done: 1 });
        expect(res.body.project.members.length).toBeGreaterThan(0);
    });

    it("returns a task with its assignee and project, only to people with access", async () => {
        const { member, outsider, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: member.id });

        const ok = await as(member.id).get(`/api/tasks/${task.id}`);
        const denied = await as(outsider.id).get(`/api/tasks/${task.id}`);

        expect(ok.status).toBe(200);
        expect(ok.body.task.assignee.id).toBe(member.id);
        expect(ok.body.task.project.id).toBe(project.id);
        expect(denied.status).toBe(403);
    });
});

describe("GET /api/tasks/:taskId/comments (cursor pagination)", () => {
    it("pages comments oldest first", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id);
        const comments = [];
        for (let i = 0; i < 5; i++) {
            comments.push(await createComment(task.id, member.id, `C${i}`, { createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) }));
        }

        const first = await as(member.id).get(`/api/tasks/${task.id}/comments?limit=3`);
        const second = await as(member.id).get(`/api/tasks/${task.id}/comments?limit=3&cursor=${first.body.nextCursor}`);

        expect([...first.body.comments, ...second.body.comments].map((c: { content: string }) => c.content)).toEqual(["C0", "C1", "C2", "C3", "C4"]);
        expect(second.body.nextCursor).toBeNull();
        expect(first.body.comments[0].user.id).toBe(member.id);
    });

    it("refuses users without access to the task", async () => {
        const { outsider, project } = await createTeam();
        const task = await createTask(project.id);
        expect((await as(outsider.id).get(`/api/tasks/${task.id}/comments`)).status).toBe(403);
    });
});
