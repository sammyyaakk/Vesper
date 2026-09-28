import { describe, expect, it } from "vitest";
import { as } from "./helpers/api.js";
import { createTask, createTeam, createUser, createWorkspace } from "./helpers/factories.js";

const DAY = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

describe("GET /api/workspaces (list)", () => {
    it("lists the caller's workspaces with their role, without nested projects", async () => {
        const { admin, member, workspace } = await createTeam();
        const stranger = await createUser();
        await createWorkspace(stranger.id);

        const asMember = await as(member.id).get("/api/workspaces");
        const asAdmin = await as(admin.id).get("/api/workspaces");

        expect(asMember.status).toBe(200);
        expect(asMember.body.workspaces).toEqual([
            expect.objectContaining({ id: workspace.id, name: workspace.name, role: "MEMBER" }),
        ]);
        expect(asMember.body.workspaces[0].projects).toBeUndefined();
        expect(asAdmin.body.workspaces[0].role).toBe("ADMIN");
    });
});

describe("GET /api/projects/:projectId/stats", () => {
    it("returns counts by status, type, priority and overdue", async () => {
        const { member, project } = await createTeam();
        await createTask(project.id, { status: "DONE", type: "BUG", priority: "HIGH", dueDate: daysFromNow(-3) });
        await createTask(project.id, { status: "TODO", type: "BUG", priority: "LOW", dueDate: daysFromNow(-1) });
        await createTask(project.id, { status: "IN_PROGRESS", type: "FEATURE", priority: "LOW", dueDate: daysFromNow(2) });

        const res = await as(member.id).get(`/api/projects/${project.id}/stats`);

        expect(res.status).toBe(200);
        expect(res.body.stats).toEqual({
            total: 3,
            todo: 1,
            inProgress: 1,
            done: 1,
            overdue: 1,
            byType: { TASK: 0, BUG: 2, FEATURE: 1, IMPROVEMENT: 0, OTHER: 0 },
            byPriority: { LOW: 2, MEDIUM: 0, HIGH: 1 },
        });
    });

    it("refuses users without access to the project", async () => {
        const { outsider, project } = await createTeam();
        expect((await as(outsider.id).get(`/api/projects/${project.id}/stats`)).status).toBe(403);
    });
});

describe("GET /api/projects/:projectId/calendar", () => {
    it("returns tasks due in the window, upcoming tasks and overdue tasks", async () => {
        const { member, project } = await createTeam();
        const inWindow = await createTask(project.id, { dueDate: daysFromNow(3) });
        await createTask(project.id, { dueDate: daysFromNow(40) });
        const overdue = await createTask(project.id, { dueDate: daysFromNow(-5) });
        await createTask(project.id, { dueDate: daysFromNow(-6), status: "DONE" });

        const res = await as(member.id).get(
            `/api/projects/${project.id}/calendar?from=${isoDate(daysFromNow(-10))}&to=${isoDate(daysFromNow(10))}`,
        );

        expect(res.status).toBe(200);
        const windowIds = res.body.tasks.map((t: { id: string }) => t.id);
        expect(windowIds).toContain(inWindow.id);
        expect(windowIds).toContain(overdue.id);
        expect(windowIds).toHaveLength(3);
        expect(res.body.upcoming.map((t: { id: string }) => t.id)[0]).toBe(inWindow.id);
        expect(res.body.overdue.count).toBe(1);
        expect(res.body.overdue.tasks.map((t: { id: string }) => t.id)).toEqual([overdue.id]);
        expect(res.body.truncated).toBe(false);
    });

    it("rejects a missing, reversed or too-long window", async () => {
        const { member, project } = await createTeam();
        const url = (from: string, to: string) => `/api/projects/${project.id}/calendar?from=${from}&to=${to}`;
        expect((await as(member.id).get(`/api/projects/${project.id}/calendar`)).status).toBe(400);
        expect((await as(member.id).get(url("2026-10-10", "2026-10-01"))).status).toBe(400);
        expect((await as(member.id).get(url("2026-01-01", "2026-06-01"))).status).toBe(400);
    });

    it("refuses users without access to the project", async () => {
        const { outsider, project } = await createTeam();
        const res = await as(outsider.id).get(`/api/projects/${project.id}/calendar?from=2026-10-01&to=2026-10-31`);
        expect(res.status).toBe(403);
    });
});

describe("legacy endpoints are gone", () => {
    it("no longer serves GET /api/comments/:taskId", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id);
        expect((await as(member.id).get(`/api/comments/${task.id}`)).status).toBe(404);
    });
});
