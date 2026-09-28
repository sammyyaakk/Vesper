import type { Prisma, WorkspaceRole } from "@prisma/client";
import prisma from "../../configs/prisma.js";

let sequence = 0;
const next = () => ++sequence;

export const createUser = (overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) => {
    const n = next();
    return prisma.user.create({
        data: { id: `user_${n}`, name: `User ${n}`, email: `user${n}@test.dev`, ...overrides },
    });
};

export const createWorkspace = async (ownerId: string, overrides: Partial<Prisma.WorkspaceUncheckedCreateInput> = {}) => {
    const n = next();
    const workspace = await prisma.workspace.create({
        data: { id: `org_${n}`, name: `Workspace ${n}`, slug: `workspace-${n}`, ownerId, ...overrides },
    });
    await addWorkspaceMember(workspace.id, ownerId, "ADMIN");
    return workspace;
};

export const addWorkspaceMember = (workspaceId: string, userId: string, role: WorkspaceRole = "MEMBER") =>
    prisma.workspaceMember.create({ data: { workspaceId, userId, role } });

export const createProject = async (
    workspaceId: string,
    teamLead: string,
    memberIds: string[] = [],
    overrides: Partial<Prisma.ProjectUncheckedCreateInput> = {},
) => {
    const project = await prisma.project.create({
        data: { name: `Project ${next()}`, workspaceId, teamLead, ...overrides },
    });
    const members = Array.from(new Set([teamLead, ...memberIds]));
    await prisma.projectMember.createMany({ data: members.map((userId) => ({ projectId: project.id, userId })) });
    return project;
};

export const createTask = (projectId: string, overrides: Partial<Prisma.TaskUncheckedCreateInput> = {}) =>
    prisma.task.create({
        data: { projectId, title: `Task ${next()}`, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), ...overrides },
    });

export const createComment = (taskId: string, userId: string, content = "A comment", overrides: Partial<Prisma.CommentUncheckedCreateInput> = {}) =>
    prisma.comment.create({ data: { taskId, userId, content, ...overrides } });

// A workspace with an admin, a project lead, a project member and an outsider (in the workspace, not the project)
export const createTeam = async () => {
    const admin = await createUser({ name: "Admin" });
    const lead = await createUser({ name: "Lead" });
    const member = await createUser({ name: "Member" });
    const outsider = await createUser({ name: "Outsider" });
    const workspace = await createWorkspace(admin.id);
    for (const user of [lead, member, outsider]) await addWorkspaceMember(workspace.id, user.id);
    const project = await createProject(workspace.id, lead.id, [member.id]);
    return { admin, lead, member, outsider, workspace, project };
};
