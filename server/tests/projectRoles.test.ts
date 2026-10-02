import { describe, expect, it } from "vitest";
import prisma from "../configs/prisma.js";
import * as handlers from "../inngest/handlers.js";
import { as } from "./helpers/api.js";
import { addProjectMember, addWorkspaceMember, createTask, createTeam, createUser } from "./helpers/factories.js";

const due = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

const roleIn = async (projectId: string, userId: string) =>
    (await prisma.projectMember.findUnique({ where: { userId_projectId: { userId, projectId } } }))?.role ?? null;

// A workspace member with the given role on the team's project
const withRole = async (team: Awaited<ReturnType<typeof createTeam>>, role: "LEAD" | "CONTRIBUTOR" | "VIEWER") => {
    const user = await createUser();
    await addWorkspaceMember(team.workspace.id, user.id);
    await addProjectMember(team.project.id, user.id, role);
    return user;
};

describe("roles on new projects", () => {
    it("makes the named lead a LEAD and invited members CONTRIBUTORS", async () => {
        const { admin, lead, member, workspace } = await createTeam();

        const res = await as(admin.id)
            .post("/api/projects")
            .send({ workspaceId: workspace.id, name: "Roles", teamLeadEmail: lead.email, teamMembers: [member.email] });

        expect(res.status).toBe(200);
        expect(await roleIn(res.body.project.id, lead.id)).toBe("LEAD");
        expect(await roleIn(res.body.project.id, member.id)).toBe("CONTRIBUTOR");
    });
});

describe("a co-lead (LEAD role, not the named lead)", () => {
    it("manages the project like the named lead", async () => {
        const team = await createTeam();
        const coLead = await withRole(team, "LEAD");
        const task = await createTask(team.project.id);

        expect((await as(coLead.id).put("/api/projects").send({ id: team.project.id, name: "Renamed by co-lead" })).status).toBe(200);
        expect((await as(coLead.id).put(`/api/tasks/${task.id}`).send({ title: "Edited", assigneeId: team.member.id })).status).toBe(200);
        expect((await as(coLead.id).post(`/api/projects/${team.project.id}/addMember`).send({ email: team.outsider.email })).status).toBe(200);
        expect((await as(coLead.id).post("/api/tasks/delete").send({ tasksIds: [task.id] })).status).toBe(200);
    });
});

describe("a viewer", () => {
    it("can see the project, its tasks and comments, and can comment", async () => {
        const team = await createTeam();
        const viewer = await withRole(team, "VIEWER");
        const task = await createTask(team.project.id);

        expect((await as(viewer.id).get(`/api/projects/${team.project.id}`)).status).toBe(200);
        expect((await as(viewer.id).get(`/api/projects/${team.project.id}/tasks`)).status).toBe(200);
        expect((await as(viewer.id).get(`/api/tasks/${task.id}/comments`)).status).toBe(200);
        expect((await as(viewer.id).post("/api/comments").send({ taskId: task.id, content: "Looks good" })).status).toBe(200);
    });

    it("can't create, claim or change tasks", async () => {
        const team = await createTeam();
        const viewer = await withRole(team, "VIEWER");
        const unassigned = await createTask(team.project.id);

        const create = await as(viewer.id).post("/api/tasks").send({ projectId: team.project.id, title: "Nope", dueDate: due() });
        const claim = await as(viewer.id).put(`/api/tasks/${unassigned.id}`).send({ assigneeId: viewer.id });

        expect(create.status).toBe(403);
        expect(claim.status).toBe(403);
        expect(create.body.message).toMatch(/view/i);
        expect(await prisma.task.count({ where: { projectId: team.project.id } })).toBe(1);
    });

    it("can't be assigned tasks", async () => {
        const team = await createTeam();
        const viewer = await withRole(team, "VIEWER");

        const res = await as(team.lead.id).post("/api/tasks").send({ projectId: team.project.id, title: "For a viewer", assigneeId: viewer.id, dueDate: due() });

        expect(res.status).toBe(400);
    });
});

describe("changing project roles", () => {
    const setRole = (actorId: string, projectId: string, userId: string, role: unknown) =>
        as(actorId).put(`/api/projects/${projectId}/members/${userId}`).send({ role });

    it("lets a lead or workspace admin change a member's role", async () => {
        const team = await createTeam();

        expect((await setRole(team.lead.id, team.project.id, team.member.id, "VIEWER")).status).toBe(200);
        expect(await roleIn(team.project.id, team.member.id)).toBe("VIEWER");
        expect((await setRole(team.admin.id, team.project.id, team.member.id, "LEAD")).status).toBe(200);
        expect(await roleIn(team.project.id, team.member.id)).toBe("LEAD");
    });

    it("refuses contributors, viewers and outsiders", async () => {
        const team = await createTeam();
        const viewer = await withRole(team, "VIEWER");
        const other = await createTeam();

        expect((await setRole(team.member.id, team.project.id, viewer.id, "LEAD")).status).toBe(403);
        expect((await setRole(viewer.id, team.project.id, viewer.id, "LEAD")).status).toBe(403);
        expect((await setRole(other.admin.id, team.project.id, team.member.id, "VIEWER")).status).toBe(403);
        expect(await roleIn(team.project.id, viewer.id)).toBe("VIEWER");
    });

    it("keeps the named lead a LEAD", async () => {
        const team = await createTeam();

        const res = await setRole(team.admin.id, team.project.id, team.lead.id, "CONTRIBUTOR");

        expect(res.status).toBe(400);
        expect(await roleIn(team.project.id, team.lead.id)).toBe("LEAD");
    });

    it("rejects unknown roles and non-members", async () => {
        const team = await createTeam();

        expect((await setRole(team.lead.id, team.project.id, team.member.id, "OWNER")).status).toBe(400);
        expect((await setRole(team.lead.id, team.project.id, team.outsider.id, "VIEWER")).status).toBe(404);
    });

    it("adds members with a chosen role", async () => {
        const team = await createTeam();

        const res = await as(team.lead.id).post(`/api/projects/${team.project.id}/addMember`).send({ email: team.outsider.email, role: "VIEWER" });

        expect(res.status).toBe(200);
        expect(await roleIn(team.project.id, team.outsider.id)).toBe("VIEWER");
    });
});

describe("handing a project over keeps it led", () => {
    it("gives the new named lead the LEAD role when the old one is deleted", async () => {
        const team = await createTeam();
        await addProjectMember(team.project.id, team.admin.id, "VIEWER");

        await handlers.handleUserDeletion({ data: { id: team.lead.id } });

        expect((await prisma.project.findUniqueOrThrow({ where: { id: team.project.id } })).teamLead).toBe(team.admin.id);
        expect(await roleIn(team.project.id, team.admin.id)).toBe("LEAD");
    });
});
