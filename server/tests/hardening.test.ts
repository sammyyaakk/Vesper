import { describe, expect, it } from "vitest";
import prisma from "../configs/prisma.js";
import * as handlers from "../inngest/handlers.js";
import { anonymous } from "./helpers/api.js";
import { addWorkspaceMember, createProject, createTask, createTeam, createUser, createWorkspace } from "./helpers/factories.js";

describe("#11 CORS", () => {
    it("allows the configured client origin", async () => {
        const res = await anonymous().get("/").set("Origin", "http://localhost:5173");
        expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });

    it("doesn't allow other origins", async () => {
        const res = await anonymous().get("/").set("Origin", "https://evil.example");
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("doesn't approve a preflight from another origin", async () => {
        const res = await anonymous()
            .options("/api/tasks")
            .set("Origin", "https://evil.example")
            .set("Access-Control-Request-Method", "POST")
            .set("Access-Control-Request-Headers", "authorization,content-type");
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
});

describe("#20 deleting a user", () => {
    const deleteUser = (id: string) => handlers.handleUserDeletion({ data: { id, deleted: true } });

    it("reassigns the projects they lead to the workspace owner, keeping tasks", async () => {
        const { admin, lead, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: lead.id });

        await deleteUser(lead.id);

        const after = await prisma.project.findUnique({ where: { id: project.id } });
        expect(after?.teamLead).toBe(admin.id);
        expect(await prisma.projectMember.count({ where: { projectId: project.id, userId: admin.id } })).toBe(1);
        const taskAfter = await prisma.task.findUnique({ where: { id: task.id } });
        expect(taskAfter).not.toBeNull();
        expect(taskAfter?.assigneeId).toBeNull();
    });

    it("transfers workspace ownership to another admin instead of deleting the workspace", async () => {
        const { admin, lead, member, workspace, project } = await createTeam();
        await prisma.workspaceMember.update({
            where: { userId_workspaceId: { userId: lead.id, workspaceId: workspace.id } },
            data: { role: "ADMIN" },
        });
        const ownersProject = await createProject(workspace.id, admin.id, [member.id]);

        await deleteUser(admin.id);

        const after = await prisma.workspace.findUnique({ where: { id: workspace.id } });
        expect(after?.ownerId).toBe(lead.id);
        expect((await prisma.project.findUnique({ where: { id: ownersProject.id } }))?.teamLead).toBe(lead.id);
        expect(await prisma.project.count({ where: { id: project.id } })).toBe(1);
    });

    it("promotes a member to admin and owner when the owner was the only admin", async () => {
        const owner = await createUser();
        const member = await createUser();
        const workspace = await createWorkspace(owner.id);
        await addWorkspaceMember(workspace.id, member.id);
        const project = await createProject(workspace.id, owner.id, [member.id]);

        await deleteUser(owner.id);

        expect((await prisma.workspace.findUnique({ where: { id: workspace.id } }))?.ownerId).toBe(member.id);
        const membership = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: member.id, workspaceId: workspace.id } },
        });
        expect(membership?.role).toBe("ADMIN");
        expect((await prisma.project.findUnique({ where: { id: project.id } }))?.teamLead).toBe(member.id);
    });

    it("removes a workspace whose only member was deleted", async () => {
        const loner = await createUser();
        const workspace = await createWorkspace(loner.id);

        await deleteUser(loner.id);

        expect(await prisma.workspace.count({ where: { id: workspace.id } })).toBe(0);
    });

    it("is safe to replay", async () => {
        const { lead } = await createTeam();
        await deleteUser(lead.id);
        await expect(deleteUser(lead.id)).resolves.not.toThrow();
    });
});
