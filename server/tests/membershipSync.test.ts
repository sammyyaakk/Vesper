import { describe, expect, it } from "vitest";
import prisma from "../configs/prisma.js";
import * as handlers from "../inngest/handlers.js";
import { as } from "./helpers/api.js";
import { createProject, createTask, createTeam } from "./helpers/factories.js";

// Shape of Clerk's organizationMembership.* webhook payloads
const membership = (workspaceId: string, userId: string, role = "org:member") => ({
    data: { role, organization: { id: workspaceId }, public_user_data: { user_id: userId } },
});

const roleOf = async (workspaceId: string, userId: string) =>
    (await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } }))?.role ?? null;

describe("removing a member from a workspace (Clerk organizationMembership.deleted)", () => {
    it("revokes their access to the workspace and its projects", async () => {
        const { member, workspace, project } = await createTeam();

        await handlers.handleWorkspaceMemberDeletion(membership(workspace.id, member.id));

        expect(await roleOf(workspace.id, member.id)).toBeNull();
        expect(await prisma.projectMember.count({ where: { userId: member.id } })).toBe(0);
        expect((await as(member.id).get(`/api/projects/${project.id}`)).status).toBe(403);
        expect((await as(member.id).get(`/api/workspaces/${workspace.id}/summary`)).status).toBe(403);
    });

    it("unassigns their tasks in that workspace only", async () => {
        const { member, workspace, project } = await createTeam();
        const other = await createTeam();
        await prisma.workspaceMember.create({ data: { workspaceId: other.workspace.id, userId: member.id, role: "MEMBER" } });
        const otherProject = await createProject(other.workspace.id, other.lead.id, [member.id]);
        const here = await createTask(project.id, { assigneeId: member.id });
        const there = await createTask(otherProject.id, { assigneeId: member.id });

        await handlers.handleWorkspaceMemberDeletion(membership(workspace.id, member.id));

        expect((await prisma.task.findUniqueOrThrow({ where: { id: here.id } })).assigneeId).toBeNull();
        expect((await prisma.task.findUniqueOrThrow({ where: { id: there.id } })).assigneeId).toBe(member.id);
        expect(await roleOf(other.workspace.id, member.id)).toBe("MEMBER");
    });

    it("hands the projects they lead to the workspace owner", async () => {
        const { admin, lead, workspace, project } = await createTeam();

        await handlers.handleWorkspaceMemberDeletion(membership(workspace.id, lead.id));

        expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).teamLead).toBe(admin.id);
        expect(await prisma.projectMember.count({ where: { projectId: project.id, userId: admin.id } })).toBe(1);
    });

    it("transfers ownership when the owner leaves", async () => {
        const { admin, lead, workspace } = await createTeam();
        await prisma.workspaceMember.update({ where: { userId_workspaceId: { userId: lead.id, workspaceId: workspace.id } }, data: { role: "ADMIN" } });
        const ownersProject = await createProject(workspace.id, admin.id);

        await handlers.handleWorkspaceMemberDeletion(membership(workspace.id, admin.id));

        expect((await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).ownerId).toBe(lead.id);
        expect((await prisma.project.findUniqueOrThrow({ where: { id: ownersProject.id } })).teamLead).toBe(lead.id);
    });

    it("is safe to replay", async () => {
        const { member, workspace } = await createTeam();
        await handlers.handleWorkspaceMemberDeletion(membership(workspace.id, member.id));
        await expect(handlers.handleWorkspaceMemberDeletion(membership(workspace.id, member.id))).resolves.not.toThrow();
    });
});

describe("adding or changing a member (Clerk organizationMembership.created / updated)", () => {
    it("adds a member with their role", async () => {
        const { workspace } = await createTeam();
        const { member: newcomer } = await createTeam();

        await handlers.handleWorkspaceMemberChange(membership(workspace.id, newcomer.id, "org:admin"));

        expect(await roleOf(workspace.id, newcomer.id)).toBe("ADMIN");
    });

    it("demotes an admin, who then loses access to projects they aren't on", async () => {
        const { admin, workspace, project } = await createTeam();
        expect((await as(admin.id).get(`/api/projects/${project.id}`)).status).toBe(200);

        await handlers.handleWorkspaceMemberChange(membership(workspace.id, admin.id, "org:member"));

        expect(await roleOf(workspace.id, admin.id)).toBe("MEMBER");
        expect((await as(admin.id).get(`/api/projects/${project.id}`)).status).toBe(403);
    });
});
