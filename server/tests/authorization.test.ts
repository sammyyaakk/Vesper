import { describe, expect, it } from "vitest";
import prisma from "../configs/prisma.js";
import { as } from "./helpers/api.js";
import { addWorkspaceMember, createComment, createProject, createTask, createTeam, createUser, createWorkspace } from "./helpers/factories.js";

const createOtherTenant = async () => {
    const owner = await createUser({ name: "Other owner" });
    const workspace = await createWorkspace(owner.id);
    const project = await createProject(workspace.id, owner.id);
    return { owner, workspace, project };
};

describe("#1 GET /api/comments/:taskId (IDOR)", () => {
    it("lets a project member read the comments", async () => {
        const { lead, member, project } = await createTeam();
        const task = await createTask(project.id);
        await createComment(task.id, lead.id, "Internal note");

        const res = await as(member.id).get(`/api/comments/${task.id}`);

        expect(res.status).toBe(200);
        expect(res.body.comments).toHaveLength(1);
    });

    it("refuses a user from another workspace", async () => {
        const { lead, project } = await createTeam();
        const task = await createTask(project.id);
        await createComment(task.id, lead.id, "Confidential");
        const attacker = await createOtherTenant();

        const res = await as(attacker.owner.id).get(`/api/comments/${task.id}`);

        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).not.toContain("Confidential");
    });

    it("refuses a workspace member who isn't on the project", async () => {
        const { outsider, project } = await createTeam();
        const task = await createTask(project.id);

        const res = await as(outsider.id).get(`/api/comments/${task.id}`);

        expect(res.status).toBe(403);
    });

    it("returns 404 for a task that doesn't exist", async () => {
        const { member } = await createTeam();
        const res = await as(member.id).get("/api/comments/00000000-0000-4000-8000-000000000000");
        expect(res.status).toBe(404);
    });
});

describe("#2 POST /api/tasks/delete across projects", () => {
    it("refuses when any task belongs to a project the caller doesn't lead, and deletes nothing", async () => {
        const { lead, project } = await createTeam();
        const ownTask = await createTask(project.id);
        const victim = await createOtherTenant();
        const victimTask = await createTask(victim.project.id);

        const res = await as(lead.id).post("/api/tasks/delete").send({ tasksIds: [ownTask.id, victimTask.id] });

        expect(res.status).toBe(403);
        expect(await prisma.task.count({ where: { id: { in: [ownTask.id, victimTask.id] } } })).toBe(2);
    });

    it("refuses when an ID doesn't exist, and deletes nothing", async () => {
        const { lead, project } = await createTeam();
        const ownTask = await createTask(project.id);

        const res = await as(lead.id)
            .post("/api/tasks/delete")
            .send({ tasksIds: [ownTask.id, "00000000-0000-4000-8000-000000000000"] });

        expect(res.status).toBe(404);
        expect(await prisma.task.count()).toBe(1);
    });

    it("deletes tasks from several projects the caller leads", async () => {
        const { lead, project, workspace } = await createTeam();
        const secondProject = await createProject(workspace.id, lead.id);
        const tasks = [await createTask(project.id), await createTask(secondProject.id)];

        const res = await as(lead.id).post("/api/tasks/delete").send({ tasksIds: tasks.map((t) => t.id) });

        expect(res.status).toBe(200);
        expect(await prisma.task.count()).toBe(0);
    });
});

describe("#4 PUT /api/projects with another workspace's project", () => {
    it("refuses an admin of workspace A editing a project in workspace B via A's ID", async () => {
        const { admin, workspace } = await createTeam();
        const victim = await createOtherTenant();

        const res = await as(admin.id)
            .put("/api/projects")
            .send({ id: victim.project.id, workspaceId: workspace.id, name: "Pwned" });

        expect(res.status).toBe(403);
        const after = await prisma.project.findUniqueOrThrow({ where: { id: victim.project.id } });
        expect(after.name).not.toBe("Pwned");
        expect(after.workspaceId).toBe(victim.workspace.id);
    });

    it("ignores an attempt to move a project to another workspace", async () => {
        const { admin, project, workspace } = await createTeam();
        const other = await createOtherTenant();
        await addWorkspaceMember(other.workspace.id, admin.id, "ADMIN");

        const res = await as(admin.id).put("/api/projects").send({ id: project.id, workspaceId: other.workspace.id, name: "Moved?" });

        expect(res.status).toBe(200);
        const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
        expect(after.workspaceId).toBe(workspace.id);
    });

    it("still lets the project lead update their project", async () => {
        const { lead, project, workspace } = await createTeam();
        const res = await as(lead.id).put("/api/projects").send({ id: project.id, workspaceId: workspace.id, name: "Renamed by lead" });
        expect(res.status).toBe(200);
        expect(res.body.project.name).toBe("Renamed by lead");
    });

    it("refuses a plain project member", async () => {
        const { member, project, workspace } = await createTeam();
        const res = await as(member.id).put("/api/projects").send({ id: project.id, workspaceId: workspace.id, name: "Nope" });
        expect(res.status).toBe(403);
    });
});

describe("#5 POST /api/projects/:projectId/addMember", () => {
    it("adds a workspace member", async () => {
        const { lead, outsider, project } = await createTeam();
        const res = await as(lead.id).post(`/api/projects/${project.id}/addMember`).send({ email: outsider.email });
        expect(res.status).toBe(200);
        expect(await prisma.projectMember.count({ where: { projectId: project.id, userId: outsider.id } })).toBe(1);
    });

    it("returns 409 for someone who is already a member, not 500", async () => {
        const { lead, member, project } = await createTeam();
        const res = await as(lead.id).post(`/api/projects/${project.id}/addMember`).send({ email: member.email });
        expect(res.status).toBe(409);
    });

    it("returns 403 (not 404) when the caller isn't the project lead", async () => {
        const { member, outsider, project } = await createTeam();
        const res = await as(member.id).post(`/api/projects/${project.id}/addMember`).send({ email: outsider.email });
        expect(res.status).toBe(403);
    });

    it("refuses to add a user from another workspace", async () => {
        const { lead, project } = await createTeam();
        const stranger = await createOtherTenant();

        const res = await as(lead.id).post(`/api/projects/${project.id}/addMember`).send({ email: stranger.owner.email });

        expect(res.status).toBe(400);
        expect(await prisma.projectMember.count({ where: { projectId: project.id, userId: stranger.owner.id } })).toBe(0);
    });

    it("gives the same answer for an unknown email and another tenant's email (no user enumeration)", async () => {
        const { lead, project } = await createTeam();
        const stranger = await createOtherTenant();

        const known = await as(lead.id).post(`/api/projects/${project.id}/addMember`).send({ email: stranger.owner.email });
        const unknown = await as(lead.id).post(`/api/projects/${project.id}/addMember`).send({ email: "ghost@test.dev" });

        expect(unknown.status).toBe(known.status);
        expect(unknown.body).toEqual(known.body);
    });
});

describe("project creation membership", () => {
    it("always makes the team lead a project member", async () => {
        const { admin, lead, workspace } = await createTeam();
        const res = await as(admin.id).post("/api/projects").send({ workspaceId: workspace.id, name: "Solo", teamLeadEmail: lead.email });
        expect(res.status).toBe(200);
        expect(await prisma.projectMember.count({ where: { projectId: res.body.project.id, userId: lead.id } })).toBe(1);
    });
});
