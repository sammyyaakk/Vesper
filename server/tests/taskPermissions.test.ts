import { describe, expect, it } from "vitest";
import prisma from "../configs/prisma.js";
import { as } from "./helpers/api.js";
import { createProject, createTask, createTeam } from "./helpers/factories.js";

const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const taskAfter = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } });

describe("#3 PUT /api/tasks/:id mass assignment", () => {
    it("ignores an attempt to move a task to another project", async () => {
        const { lead, project, workspace } = await createTeam();
        const otherProject = await createProject(workspace.id, lead.id);
        const task = await createTask(project.id);

        const res = await as(lead.id).put(`/api/tasks/${task.id}`).send({ projectId: otherProject.id, title: "Still here" });

        expect(res.status).toBe(200);
        const after = await taskAfter(task.id);
        expect(after.projectId).toBe(project.id);
        expect(after.title).toBe("Still here");
    });

    it("ignores server-managed fields like createdAt", async () => {
        const { lead, project } = await createTeam();
        const task = await createTask(project.id);

        await as(lead.id).put(`/api/tasks/${task.id}`).send({ createdAt: "2000-01-01T00:00:00.000Z" });

        expect((await taskAfter(task.id)).createdAt.getFullYear()).not.toBe(2000);
    });

    it("rejects assigning someone who isn't on the project", async () => {
        const { lead, outsider, project } = await createTeam();
        const task = await createTask(project.id);

        const res = await as(lead.id).put(`/api/tasks/${task.id}`).send({ assigneeId: outsider.id });

        expect(res.status).toBe(400);
        expect((await taskAfter(task.id)).assigneeId).toBeNull();
    });

    it("rejects an invalid status with 400, not 500", async () => {
        const { lead, project } = await createTeam();
        const task = await createTask(project.id);
        const res = await as(lead.id).put(`/api/tasks/${task.id}`).send({ status: "DONEZO" });
        expect(res.status).toBe(400);
    });
});

describe("DR-022 task permissions: members", () => {
    it("lets a member claim an unassigned task", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id);

        const res = await as(member.id).put(`/api/tasks/${task.id}`).send({ assigneeId: member.id });

        expect(res.status).toBe(200);
        expect((await taskAfter(task.id)).assigneeId).toBe(member.id);
    });

    it("refuses a member taking a task assigned to someone else", async () => {
        const { lead, member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: lead.id });

        const res = await as(member.id).put(`/api/tasks/${task.id}`).send({ assigneeId: member.id });

        expect(res.status).toBe(403);
        expect((await taskAfter(task.id)).assigneeId).toBe(lead.id);
    });

    it("refuses a member assigning an unassigned task to someone else", async () => {
        const { lead, member, project } = await createTeam();
        const task = await createTask(project.id);
        const res = await as(member.id).put(`/api/tasks/${task.id}`).send({ assigneeId: lead.id });
        expect(res.status).toBe(403);
    });

    it("lets the assignee change the status of their task", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: member.id });

        const res = await as(member.id).put(`/api/tasks/${task.id}`).send({ status: "DONE" });

        expect(res.status).toBe(200);
        expect((await taskAfter(task.id)).status).toBe("DONE");
    });

    it("refuses a member changing the status of someone else's task", async () => {
        const { lead, member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: lead.id });
        const res = await as(member.id).put(`/api/tasks/${task.id}`).send({ status: "DONE" });
        expect(res.status).toBe(403);
    });

    it("refuses the assignee editing task details", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: member.id });

        const res = await as(member.id).put(`/api/tasks/${task.id}`).send({ title: "Renamed", dueDate: inAWeek() });

        expect(res.status).toBe(403);
        expect((await taskAfter(task.id)).title).toBe(task.title);
    });

    it("lets the assignee unassign themselves", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: member.id });

        const res = await as(member.id).put(`/api/tasks/${task.id}`).send({ assigneeId: null });

        expect(res.status).toBe(200);
        expect((await taskAfter(task.id)).assigneeId).toBeNull();
    });

    it("lets a member create an unassigned or self-assigned task", async () => {
        const { member, project } = await createTeam();
        const base = { projectId: project.id, dueDate: inAWeek() };

        const unassigned = await as(member.id).post("/api/tasks").send({ ...base, title: "Unassigned" });
        const selfAssigned = await as(member.id).post("/api/tasks").send({ ...base, title: "Mine", assigneeId: member.id });

        expect(unassigned.status).toBe(200);
        expect(selfAssigned.status).toBe(200);
    });

    it("refuses a member creating a task assigned to someone else", async () => {
        const { lead, member, project } = await createTeam();
        const res = await as(member.id)
            .post("/api/tasks")
            .send({ projectId: project.id, title: "For the lead", dueDate: inAWeek(), assigneeId: lead.id });
        expect(res.status).toBe(403);
    });

    it("refuses a member deleting a task", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: member.id });
        const res = await as(member.id).post("/api/tasks/delete").send({ tasksIds: [task.id] });
        expect(res.status).toBe(403);
    });
});

describe("DR-022 task permissions: people outside the project", () => {
    it("refuses a workspace member who isn't on the project, even to claim", async () => {
        const { outsider, project } = await createTeam();
        const task = await createTask(project.id);
        const res = await as(outsider.id).put(`/api/tasks/${task.id}`).send({ assigneeId: outsider.id });
        expect(res.status).toBe(403);
    });
});

describe("DR-022 task permissions: workspace admins", () => {
    it("lets a workspace admin edit a task in a project they aren't on", async () => {
        const { admin, member, project } = await createTeam();
        const task = await createTask(project.id);

        const res = await as(admin.id).put(`/api/tasks/${task.id}`).send({ title: "Admin edit", assigneeId: member.id });

        expect(res.status).toBe(200);
        const after = await taskAfter(task.id);
        expect(after.title).toBe("Admin edit");
        expect(after.assigneeId).toBe(member.id);
    });

    it("lets a workspace admin create and delete tasks", async () => {
        const { admin, project } = await createTeam();
        const created = await as(admin.id).post("/api/tasks").send({ projectId: project.id, title: "By admin", dueDate: inAWeek() });
        expect(created.status).toBe(200);

        const deleted = await as(admin.id).post("/api/tasks/delete").send({ tasksIds: [created.body.task.id] });
        expect(deleted.status).toBe(200);
    });

    it("lets a workspace admin add project members", async () => {
        const { admin, outsider, project } = await createTeam();
        const res = await as(admin.id).post(`/api/projects/${project.id}/addMember`).send({ email: outsider.email });
        expect(res.status).toBe(200);
    });
});
