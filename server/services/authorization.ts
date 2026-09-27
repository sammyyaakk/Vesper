import type { WorkspaceRole } from "@prisma/client";
import prisma from "../configs/prisma.js";
import { AppError } from "../utils/AppError.js";

type WorkspaceWithMembers = NonNullable<Awaited<ReturnType<typeof findWorkspace>>>;

const findWorkspace = (workspaceId: string) =>
    prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { members: { include: { user: true } } },
    });

const findProject = (projectId: string) =>
    prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { include: { user: true } } },
    });

export const requireWorkspace = async (workspaceId: string) => {
    const workspace = await findWorkspace(workspaceId);
    if (!workspace) throw AppError.notFound("Workspace not found");
    return workspace;
};

export const hasWorkspaceRole = (workspace: WorkspaceWithMembers, userId: string, role: WorkspaceRole) =>
    workspace.members.some((member) => member.userId === userId && member.role === role);

export const requireWorkspaceRole = async (
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    denied = AppError.forbidden("You don't have permission to perform this action in this workspace"),
) => {
    const workspace = await requireWorkspace(workspaceId);
    if (!hasWorkspaceRole(workspace, userId, role)) throw denied;
    return workspace;
};

export const requireProject = async (projectId: string) => {
    const project = await findProject(projectId);
    if (!project) throw AppError.notFound("Project not found");
    return project;
};

export const requireProjectLead = async (
    projectId: string,
    userId: string,
    denied = AppError.forbidden("You don't have admin privileges for this project"),
) => {
    const project = await requireProject(projectId);
    if (project.teamLead !== userId) throw denied;
    return project;
};

export const requireProjectMember = async (
    projectId: string,
    userId: string,
    denied = AppError.forbidden("You are not member of this project"),
) => {
    const project = await requireProject(projectId);
    const isMember = project.teamLead === userId || project.members.some((member) => member.userId === userId);
    if (!isMember) throw denied;
    return project;
};

export const requireProjectManager = async (
    projectId: string,
    userId: string,
    denied = AppError.forbidden("You don't have permission to manage this project"),
) => {
    const project = await requireProject(projectId);
    if (project.teamLead === userId) return project;
    const workspace = await requireWorkspace(project.workspaceId);
    if (!hasWorkspaceRole(workspace, userId, "ADMIN")) throw denied;
    return project;
};

export const requireTaskProjectMember = async (taskId: string, userId: string) => {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw AppError.notFound("Task not found");
    await requireProjectMember(task.projectId, userId);
};
