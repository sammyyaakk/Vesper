import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import prisma from "../configs/prisma.js";
import { as } from "./helpers/api.js";
import { createTask, createTeam, createUser, createWorkspace } from "./helpers/factories.js";

const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("POST /api/tasks validation", () => {
    const validTask = (projectId: string) => ({ projectId, title: "Write tests", dueDate: inAWeek() });

    it("#13: rejects a task without a due date with 400, not 500", async () => {
        const { lead, project } = await createTeam();
        const { dueDate: _omit, ...body } = validTask(project.id);

        const res = await as(lead.id).post("/api/tasks").send(body);

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/dueDate/);
        expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: "dueDate" })]));
        expect(await prisma.task.count()).toBe(0);
    });

    it("rejects an unparseable due date", async () => {
        const { lead, project } = await createTeam();
        const res = await as(lead.id).post("/api/tasks").send({ ...validTask(project.id), dueDate: "next friday" });
        expect(res.status).toBe(400);
    });

    it("rejects a blank title", async () => {
        const { lead, project } = await createTeam();
        const res = await as(lead.id).post("/api/tasks").send({ ...validTask(project.id), title: "   " });
        expect(res.status).toBe(400);
        expect(await prisma.task.count()).toBe(0);
    });

    it("rejects an unknown status value", async () => {
        const { lead, project } = await createTeam();
        const res = await as(lead.id).post("/api/tasks").send({ ...validTask(project.id), status: "DONEZO" });
        expect(res.status).toBe(400);
    });

    it("rejects a missing projectId", async () => {
        const { lead } = await createTeam();
        const res = await as(lead.id).post("/api/tasks").send({ title: "No project", dueDate: inAWeek() });
        expect(res.status).toBe(400);
    });

    it("accepts a valid task and treats an empty assignee as unassigned", async () => {
        const { lead, project } = await createTeam();
        const res = await as(lead.id).post("/api/tasks").send({ ...validTask(project.id), assigneeId: "" });
        expect(res.status).toBe(200);
        expect(res.body.task.assigneeId).toBeNull();
    });
});

describe("POST /api/tasks/delete validation", () => {
    it("rejects an empty list of IDs with 400", async () => {
        const { lead } = await createTeam();
        const res = await as(lead.id).post("/api/tasks/delete").send({ tasksIds: [] });
        expect(res.status).toBe(400);
    });

    it("rejects a non-array body", async () => {
        const { lead } = await createTeam();
        const res = await as(lead.id).post("/api/tasks/delete").send({ tasksIds: "abc" });
        expect(res.status).toBe(400);
    });
});

describe("comments validation", () => {
    it("#7: returns 404 for a comment on a task that doesn't exist, not 500", async () => {
        const { member } = await createTeam();
        const res = await as(member.id).post("/api/comments").send({ taskId: randomUUID(), content: "Hello" });
        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Task not found");
    });

    it("rejects a blank comment", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id);
        const res = await as(member.id).post("/api/comments").send({ taskId: task.id, content: "  " });
        expect(res.status).toBe(400);
        expect(await prisma.comment.count()).toBe(0);
    });

    it("rejects a malformed task ID in the URL", async () => {
        const { member } = await createTeam();
        const res = await as(member.id).get("/api/tasks/not-a-uuid/comments");
        expect(res.status).toBe(400);
    });
});

describe("POST /api/projects validation", () => {
    const validProject = (workspaceId: string, teamLeadEmail: string) => ({ workspaceId, name: "Launch", teamLeadEmail });

    it("#6: rejects an unknown team lead email with 400, not 500", async () => {
        const { admin, workspace } = await createTeam();
        const res = await as(admin.id).post("/api/projects").send(validProject(workspace.id, "nobody@test.dev"));
        expect(res.status).toBe(400);
        expect(await prisma.project.count()).toBe(1);
    });

    it("#6: rejects a team lead who isn't a member of the workspace", async () => {
        const { admin, workspace } = await createTeam();
        const stranger = await createUser();
        await createWorkspace(stranger.id);

        const res = await as(admin.id).post("/api/projects").send(validProject(workspace.id, stranger.email));

        expect(res.status).toBe(400);
        expect(await prisma.project.count()).toBe(1);
    });

    it("rejects an end date before the start date", async () => {
        const { admin, lead, workspace } = await createTeam();
        const res = await as(admin.id)
            .post("/api/projects")
            .send({ ...validProject(workspace.id, lead.email), startDate: "2026-10-10", endDate: "2026-10-01" });
        expect(res.status).toBe(400);
    });

    it("accepts a valid project with empty optional dates", async () => {
        const { admin, lead, workspace } = await createTeam();
        const res = await as(admin.id)
            .post("/api/projects")
            .send({ ...validProject(workspace.id, lead.email), startDate: "", endDate: "" });
        expect(res.status).toBe(200);
        expect(res.body.project.teamLead).toBe(lead.id);
    });
});

describe("PUT /api/projects validation", () => {
    it("accepts the full project object the settings page sends back", async () => {
        const { admin, workspace, project: created } = await createTeam();
        const { project } = (await as(admin.id).get(`/api/projects/${created.id}`)).body;

        const res = await as(admin.id)
            .put("/api/projects")
            .send({ ...project, name: "Renamed", workspaceId: workspace.id });

        expect(res.status).toBe(200);
        expect(res.body.project.name).toBe("Renamed");
    });

    it("rejects a blank name", async () => {
        const { admin, project, workspace } = await createTeam();
        const res = await as(admin.id).put("/api/projects").send({ id: project.id, workspaceId: workspace.id, name: " " });
        expect(res.status).toBe(400);
    });
});

describe("PUT /api/tasks/:id editing", () => {
    it("lets a manager edit every detail in one request", async () => {
        const { lead, member, project } = await createTeam();
        const task = await createTask(project.id, { title: "Old", description: "Old notes" });

        const res = await as(lead.id)
            .put(`/api/tasks/${task.id}`)
            .send({ title: "New", description: "New notes", type: "BUG", priority: "HIGH", status: "IN_PROGRESS", assigneeId: member.id, dueDate: inAWeek() });

        expect(res.status).toBe(200);
        expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
            title: "New",
            description: "New notes",
            type: "BUG",
            priority: "HIGH",
            status: "IN_PROGRESS",
            assigneeId: member.id,
        });
    });

    it("clears the description when it's sent empty", async () => {
        const { lead, project } = await createTeam();
        const task = await createTask(project.id, { description: "Remove me" });

        const res = await as(lead.id).put(`/api/tasks/${task.id}`).send({ description: "" });

        expect(res.status).toBe(200);
        expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).description).toBeNull();
    });

    it("leaves the description alone when it's omitted", async () => {
        const { lead, project } = await createTeam();
        const task = await createTask(project.id, { description: "Keep me" });

        await as(lead.id).put(`/api/tasks/${task.id}`).send({ title: "Renamed" });

        expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).description).toBe("Keep me");
    });
});
