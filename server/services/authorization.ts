import type { Prisma, ProjectRole, Task, WorkspaceRole } from "@prisma/client";
import prisma from "../configs/prisma.js";
import type { UpdateTaskInput } from "../schemas/task.js";
import { AppError } from "../utils/AppError.js";

type WorkspaceWithMembers = NonNullable<Awaited<ReturnType<typeof findWorkspace>>>;
type ProjectWithMembers = NonNullable<Awaited<ReturnType<typeof findProject>>>;

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

export const requireWorkspaceMembership = async (workspaceId: string, userId: string) => {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!workspace) throw AppError.notFound("Workspace not found");
    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { role: true },
    });
    if (!membership) throw AppError.forbidden("You are not a member of this workspace");
    return membership.role;
};

// Admins see every project in the workspace; members see the projects they lead or belong to
export const accessibleProjects = (workspaceId: string, userId: string, role: WorkspaceRole): Prisma.ProjectWhereInput =>
    role === "ADMIN" ? { workspaceId } : { workspaceId, OR: [{ teamLead: userId }, { members: { some: { userId } } }] };

export const requireProject = async (projectId: string) => {
    const project = await findProject(projectId);
    if (!project) throw AppError.notFound("Project not found");
    return project;
};

export const isProjectMember = (project: ProjectWithMembers, userId: string) =>
    project.teamLead === userId || project.members.some((member) => member.userId === userId);

// The named lead always counts as LEAD, even if their membership row were missing
export const projectRoleOf = (project: ProjectWithMembers, userId: string): ProjectRole | null =>
    project.teamLead === userId ? "LEAD" : (project.members.find((member) => member.userId === userId)?.role ?? null);

// Managers are every LEAD of the project and admins of the project's own workspace
const isProjectManager = async (project: ProjectWithMembers, userId: string) => {
    if (projectRoleOf(project, userId) === "LEAD") return true;
    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId: project.workspaceId } },
        select: { role: true },
    });
    return membership?.role === "ADMIN";
};

export const requireProjectManager = async (
    projectId: string,
    userId: string,
    denied = AppError.forbidden("You don't have permission to manage this project"),
) => {
    const project = await requireProject(projectId);
    if (!(await isProjectManager(project, userId))) throw denied;
    return project;
};

export const requireProjectAccess = async (projectId: string, userId: string) => {
    const project = await requireProject(projectId);
    const isManager = await isProjectManager(project, userId);
    if (!isManager && !isProjectMember(project, userId)) throw AppError.forbidden("You are not member of this project");
    // Viewers can read and comment; everyone else on the project can work on tasks
    const canContribute = isManager || projectRoleOf(project, userId) === "CONTRIBUTOR";
    return { project, isManager, canContribute };
};

export const requireTaskAccess = async (taskId: string, userId: string) => {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw AppError.notFound("Task not found");
    const { project, isManager, canContribute } = await requireProjectAccess(task.projectId, userId);
    return { task, project, isManager, canContribute };
};

// DR-022: members may claim an unassigned task, unassign themselves, and change the status of their own tasks
export const assertCanUpdateTask = (task: Task, isManager: boolean, userId: string, changes: UpdateTaskInput) => {
    if (isManager) return;

    const { status, assigneeId, ...details } = changes;
    if (Object.values(details).some((value) => value !== undefined)) {
        throw AppError.forbidden("Only the project lead or a workspace admin can edit task details");
    }

    if (assigneeId !== undefined) {
        const claiming = task.assigneeId === null && assigneeId === userId;
        const unassigningSelf = task.assigneeId === userId && assigneeId === null;
        if (!claiming && !unassigningSelf) {
            throw AppError.forbidden("You can only claim unassigned tasks or unassign yourself");
        }
    }

    const assigneeAfter = assigneeId !== undefined ? assigneeId : task.assigneeId;
    if (status !== undefined && assigneeAfter !== userId) {
        throw AppError.forbidden("You can only change the status of tasks assigned to you");
    }
};

export const assertCanCreateTaskFor = (isManager: boolean, userId: string, assigneeId: string | null | undefined) => {
    if (!isManager && assigneeId && assigneeId !== userId) {
        throw AppError.forbidden("Members can only create unassigned tasks or tasks assigned to themselves");
    }
};
