import prisma from "../configs/prisma.js";
import type { CreateProjectInput, UpdateProjectInput } from "../schemas/project.js";
import { AppError } from "../utils/AppError.js";
import type { TaskListQuery } from "../schemas/query.js";
import { after, orderBy, toPage } from "../utils/pagination.js";
import { requireProjectAccess, requireProjectManager, requireWorkspace, requireWorkspaceRole } from "./authorization.js";
import { taskCountsByProject } from "./taskCounts.js";

export const create = async (userId: string, input: CreateProjectInput) => {
    const { workspaceId, description, name, status, startDate, endDate, teamMembers, teamLeadEmail, priority } = input;

    const workspace = await requireWorkspaceRole(
        workspaceId,
        userId,
        "ADMIN",
        AppError.forbidden("You don't have permission to create projects in this workspace"),
    );

    const teamLead = workspace.members.find((member) => member.user.email === teamLeadEmail);
    if (!teamLead) throw AppError.badRequest("Team lead must be a member of this workspace");

    const project = await prisma.project.create({
        data: {
            workspaceId,
            name,
            description,
            status,
            priority,
            teamLead: teamLead.userId,
            startDate: startDate ?? null,
            endDate: endDate ?? null,
        },
    });

    const invitedIds = workspace.members
        .filter((member) => teamMembers?.includes(member.user.email))
        .map((member) => member.userId);
    const memberIds = [...new Set([teamLead.userId, ...invitedIds])];

    await prisma.projectMember.createMany({
        data: memberIds.map((memberId) => ({ projectId: project.id, userId: memberId })),
    });

    return prisma.project.findUnique({
        where: { id: project.id },
        include: {
            members: { include: { user: true } },
            tasks: { include: { assignee: true, comments: { include: { user: true } } } },
            owner: true,
        },
    });
};

export const update = async (userId: string, input: UpdateProjectInput) => {
    const { id, description, name, status, startDate, endDate, priority } = input;

    await requireProjectManager(id, userId, AppError.forbidden("You don't have permission to update this project"));

    return prisma.project.update({
        where: { id },
        data: {
            description,
            name,
            status,
            priority,
            startDate: startDate ?? null,
            endDate: endDate ?? null,
        },
    });
};

export const addMember = async (userId: string, projectId: string, email: string) => {
    const project = await requireProjectManager(projectId, userId, AppError.forbidden("Only the project lead or a workspace admin can add members"));
    const workspace = await requireWorkspace(project.workspaceId);

    const newMember = workspace.members.find((member) => member.user.email === email);
    if (!newMember) throw AppError.badRequest("No member of this workspace has that email");

    if (project.members.some((member) => member.userId === newMember.userId)) {
        throw AppError.conflict("User is already a member of this project");
    }

    return prisma.projectMember.create({
        data: { userId: newMember.userId, projectId },
    });
};

export const get = async (userId: string, projectId: string) => {
    await requireProjectAccess(projectId, userId);
    const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        include: { members: { include: { user: true } }, owner: true },
    });
    const counts = await taskCountsByProject([projectId]);
    return { ...project, taskCounts: counts.get(projectId)! };
};

export const listTasks = async (userId: string, projectId: string, query: TaskListQuery) => {
    await requireProjectAccess(projectId, userId);
    const { status, type, priority, assignee, cursor, limit } = query;
    const assigneeId = assignee === "me" ? userId : assignee === "none" ? null : assignee;

    const rows = await prisma.task.findMany({
        where: { projectId, status, type, priority, ...(assignee !== undefined ? { assigneeId } : {}), ...after(cursor, "desc") },
        include: { assignee: true },
        orderBy: orderBy("desc"),
        take: limit + 1,
    });
    return toPage(rows, limit);
};
