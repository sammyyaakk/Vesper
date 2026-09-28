import type { WorkspaceRole } from "@prisma/client";
import prisma from "../configs/prisma.js";
import { accessibleProjects, requireWorkspaceMembership } from "./authorization.js";
import { taskCountsByProject } from "./taskCounts.js";
import { cached } from "./workspaceCache.js";

export const listForUser = async (userId: string) => {
    const memberships = await prisma.workspaceMember.findMany({
        where: { userId },
        include: { workspace: { select: { id: true, name: true, slug: true, imageUrl: true, ownerId: true } } },
        orderBy: { workspace: { name: "asc" } },
    });
    return memberships.map(({ workspace, role }) => ({ ...workspace, role }));
};

export const get = async (userId: string, workspaceId: string) => {
    const role = await requireWorkspaceMembership(workspaceId, userId);
    const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: { members: { include: { user: true } }, owner: true },
    });
    return { workspace, role };
};

export const listProjects = async (userId: string, workspaceId: string) => {
    const role = await requireWorkspaceMembership(workspaceId, userId);
    return cached(workspaceId, `projects:${userId}:${role}`, () => loadProjects(userId, workspaceId, role));
};

const loadProjects = async (userId: string, workspaceId: string, role: WorkspaceRole) => {
    const projects = await prisma.project.findMany({
        where: accessibleProjects(workspaceId, userId, role),
        include: { members: { include: { user: true } }, owner: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const counts = await taskCountsByProject(projects.map((project) => project.id));
    return projects.map((project) => ({ ...project, taskCounts: counts.get(project.id)! }));
};

const summaryTaskFields = {
    include: {
        assignee: { select: { id: true, name: true, image: true } },
        project: { select: { id: true, name: true } },
    },
} as const;

export const summary = async (userId: string, workspaceId: string) => {
    const role = await requireWorkspaceMembership(workspaceId, userId);
    return cached(workspaceId, `summary:${userId}:${role}`, () => loadSummary(userId, workspaceId, role));
};

const loadSummary = async (userId: string, workspaceId: string, role: WorkspaceRole) => {
    const projects = await prisma.project.findMany({
        where: accessibleProjects(workspaceId, userId, role),
        select: { id: true, status: true },
    });
    const inProjects = { projectId: { in: projects.map((project) => project.id) } };
    const open = { ...inProjects, status: { not: "DONE" as const } };
    const now = new Date();

    const [byStatus, overdue, mine, myTasks, overdueTasks, inProgressTasks, recentTasks] = await Promise.all([
        prisma.task.groupBy({ by: ["status"], where: inProjects, _count: { _all: true } }),
        prisma.task.count({ where: { ...open, dueDate: { lt: now } } }),
        prisma.task.count({ where: { ...open, assigneeId: userId } }),
        prisma.task.findMany({ where: { ...open, assigneeId: userId }, orderBy: { dueDate: "asc" }, take: 10, ...summaryTaskFields }),
        prisma.task.findMany({ where: { ...open, dueDate: { lt: now } }, orderBy: { dueDate: "asc" }, take: 5, ...summaryTaskFields }),
        prisma.task.findMany({ where: { ...inProjects, status: "IN_PROGRESS" }, orderBy: { updatedAt: "desc" }, take: 5, ...summaryTaskFields }),
        prisma.task.findMany({ where: inProjects, orderBy: { updatedAt: "desc" }, take: 10, ...summaryTaskFields }),
    ]);

    const countOf = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
    return {
        projects: {
            total: projects.length,
            active: projects.filter((project) => project.status === "ACTIVE").length,
            completed: projects.filter((project) => project.status === "COMPLETED").length,
        },
        tasks: {
            total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
            todo: countOf("TODO"),
            inProgress: countOf("IN_PROGRESS"),
            done: countOf("DONE"),
            overdue,
            mine,
        },
        myTasks,
        overdueTasks,
        inProgressTasks,
        recentTasks,
    };
};
