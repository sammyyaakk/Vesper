import { describe, expect, it, vi } from "vitest";
import prisma from "../configs/prisma.js";
import { redis } from "../configs/redis.js";
import * as handlers from "../inngest/handlers.js";
import { createWorkspaceCache } from "../services/workspaceCache.js";
import { as } from "./helpers/api.js";
import { createProject, createTask, createTeam, createUser } from "./helpers/factories.js";

type Team = Awaited<ReturnType<typeof createTeam>>;

const summaryOf = async (userId: string, workspaceId: string) => {
    const res = await as(userId).get(`/api/workspaces/${workspaceId}/summary`);
    expect(res.status).toBe(200);
    return res.body;
};

const projectsOf = async (userId: string, workspaceId: string) => {
    const res = await as(userId).get(`/api/workspaces/${workspaceId}/projects`);
    expect(res.status).toBe(200);
    return res.body.projects as { id: string; name: string; members: { userId: string }[]; taskCounts: { total: number } }[];
};

const due = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

// Factories write straight to the database, so they change data without invalidating: a stale read proves a cache hit
const warm = async ({ admin, lead, workspace }: Team) => {
    await summaryOf(lead.id, workspace.id);
    await projectsOf(admin.id, workspace.id);
};

describe("workspace cache", () => {
    it("serves repeated reads from the cache", async () => {
        const team = await createTeam();
        await warm(team);

        await createTask(team.project.id);

        expect((await summaryOf(team.lead.id, team.workspace.id)).tasks.total).toBe(0);
        expect((await projectsOf(team.admin.id, team.workspace.id))[0]!.taskCounts.total).toBe(0);
    });

    it("stores entries with a short expiry", async () => {
        const team = await createTeam();
        await warm(team);

        const keys = await redis!.keys("cache:*");
        expect(keys.length).toBeGreaterThanOrEqual(2);
        for (const key of keys) {
            const ttl = await redis!.ttl(key);
            expect(ttl).toBeGreaterThan(0);
            expect(ttl).toBeLessThanOrEqual(60);
        }
    });

    it("keeps each user's view separate", async () => {
        const team = await createTeam();
        await createProject(team.workspace.id, team.admin.id);

        expect(await projectsOf(team.admin.id, team.workspace.id)).toHaveLength(2);
        expect(await projectsOf(team.member.id, team.workspace.id)).toHaveLength(1);
    });

    it("still checks membership when the cache is warm", async () => {
        const team = await createTeam();
        await summaryOf(team.member.id, team.workspace.id);

        await prisma.workspaceMember.deleteMany({ where: { userId: team.member.id } });

        expect((await as(team.member.id).get(`/api/workspaces/${team.workspace.id}/summary`)).status).toBe(403);
    });

    describe("invalidation through the API", () => {
        it("on task create, update and delete", async () => {
            const team = await createTeam();
            const { lead, workspace, project } = team;
            await warm(team);

            const created = await as(lead.id).post("/api/tasks").send({ projectId: project.id, title: "Cached?", assigneeId: lead.id, dueDate: due() });
            expect(created.status).toBe(200);
            expect((await summaryOf(lead.id, workspace.id)).tasks.total).toBe(1);
            expect((await projectsOf(team.admin.id, workspace.id))[0]!.taskCounts.total).toBe(1);

            const taskId = created.body.task.id;
            expect((await as(lead.id).put(`/api/tasks/${taskId}`).send({ status: "DONE" })).status).toBe(200);
            expect((await summaryOf(lead.id, workspace.id)).tasks.done).toBe(1);

            expect((await as(lead.id).post("/api/tasks/delete").send({ tasksIds: [taskId] })).status).toBe(200);
            expect((await summaryOf(lead.id, workspace.id)).tasks.total).toBe(0);
        });

        it("on project create, update and new member", async () => {
            const team = await createTeam();
            const { admin, lead, outsider, workspace, project } = team;
            await warm(team);
            await projectsOf(outsider.id, workspace.id);

            const created = await as(admin.id).post("/api/projects").send({ workspaceId: workspace.id, name: "Second", teamLeadEmail: lead.email });
            expect(created.status).toBe(200);
            expect(await projectsOf(admin.id, workspace.id)).toHaveLength(2);
            expect((await summaryOf(lead.id, workspace.id)).projects.total).toBe(2);

            expect((await as(admin.id).put("/api/projects").send({ id: project.id, workspaceId: workspace.id, name: "Renamed" })).status).toBe(200);
            expect((await projectsOf(admin.id, workspace.id)).map((p) => p.name)).toContain("Renamed");

            expect((await as(admin.id).post(`/api/projects/${project.id}/addMember`).send({ email: outsider.email })).status).toBe(200);
            expect(await projectsOf(outsider.id, workspace.id)).toHaveLength(1);
        });

        it("leaves other workspaces' caches alone", async () => {
            const changed = await createTeam();
            const untouched = await createTeam();
            await warm(changed);
            await warm(untouched);

            await createTask(untouched.project.id);
            await as(changed.lead.id).post("/api/tasks").send({ projectId: changed.project.id, title: "Here", dueDate: due() });

            expect((await summaryOf(changed.lead.id, changed.workspace.id)).tasks.total).toBe(1);
            expect((await summaryOf(untouched.lead.id, untouched.workspace.id)).tasks.total).toBe(0);
        });
    });

    describe("invalidation from Clerk sync", () => {
        it("when a user's name changes", async () => {
            const team = await createTeam();
            await warm(team);

            await handlers.handleUserUpdation({
                data: { id: team.lead.id, first_name: "Renamed", last_name: "Lead", email_addresses: [{ email_address: team.lead.email }] },
            });

            const [project] = await projectsOf(team.admin.id, team.workspace.id);
            expect((project as unknown as { owner: { name: string } }).owner.name).toBe("Renamed Lead");
        });

        it("when someone joins the workspace", async () => {
            const team = await createTeam();
            const joiner = await createUser();
            await createProject(team.workspace.id, joiner.id);
            await projectsOf(team.admin.id, team.workspace.id);
            await createProject(team.workspace.id, team.admin.id);

            await handlers.handleWorkspaceMemberCreation({ data: { user_id: joiner.id, organization_id: team.workspace.id, role: "org:member" } });

            expect(await projectsOf(team.admin.id, team.workspace.id)).toHaveLength(3);
        });

        it("when a user is deleted", async () => {
            const team = await createTeam();
            await createTask(team.project.id, { assigneeId: team.member.id });
            await summaryOf(team.lead.id, team.workspace.id);

            await handlers.handleUserDeletion({ data: { id: team.member.id } });

            expect((await summaryOf(team.lead.id, team.workspace.id)).recentTasks[0].assignee).toBeNull();
        });
    });

    describe("when Redis fails", () => {
        const broken = {
            get: () => Promise.reject(new Error("Connection is closed.")),
            set: () => Promise.reject(new Error("Connection is closed.")),
            incr: () => Promise.reject(new Error("Connection is closed.")),
        } as unknown as NonNullable<typeof redis>;

        it("loads from the source instead", async () => {
            const { cached } = createWorkspaceCache(broken);
            const load = vi.fn().mockResolvedValue({ fresh: true });

            expect(await cached("org_1", "view", load)).toEqual({ fresh: true });
            expect(await cached("org_1", "view", load)).toEqual({ fresh: true });
            expect(load).toHaveBeenCalledTimes(2);
        });

        it("doesn't fail the write that invalidates", async () => {
            const { invalidate } = createWorkspaceCache(broken);
            await expect(invalidate("org_1")).resolves.toBeUndefined();
        });

        it("works without Redis configured", async () => {
            const { cached, invalidate } = createWorkspaceCache(null);
            expect(await cached("org_1", "view", async () => 42)).toBe(42);
            await expect(invalidate("org_1")).resolves.toBeUndefined();
        });
    });
});
