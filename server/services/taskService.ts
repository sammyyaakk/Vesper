import prisma from "../configs/prisma.js";
import { inngest } from "../inngest/index.js";
import type { CreateTaskInput, UpdateTaskInput } from "../schemas/task.js";
import { AppError } from "../utils/AppError.js";
import {
    assertCanCreateTaskFor,
    assertCanUpdateTask,
    isProjectMember,
    requireProjectAccess,
    requireProjectManager,
    requireTaskAccess,
} from "./authorization.js";

const assertAssigneeOnProject = (project: Parameters<typeof isProjectMember>[0], assigneeId: string | null | undefined) => {
    if (assigneeId && !isProjectMember(project, assigneeId)) {
        throw AppError.badRequest("Assignee must be a member of this project");
    }
};

export const create = async (userId: string, input: CreateTaskInput, origin?: string) => {
    const { projectId, title, description, type, status, priority, assigneeId, dueDate } = input;

    const { project, isManager } = await requireProjectAccess(projectId, userId);
    assertCanCreateTaskFor(isManager, userId, assigneeId);
    assertAssigneeOnProject(project, assigneeId);

    const task = await prisma.task.create({
        data: {
            projectId,
            title,
            description,
            type,
            priority,
            assigneeId: assigneeId ?? null,
            status,
            dueDate,
        },
    });

    const taskWithAssignee = await prisma.task.findUnique({
        where: { id: task.id },
        include: { assignee: true },
    });

    await inngest.send({
        name: "app/task.assigned",
        data: { taskId: task.id, origin },
    });

    return taskWithAssignee;
};

export const update = async (userId: string, taskId: string, changes: UpdateTaskInput) => {
    const { task, project, isManager } = await requireTaskAccess(taskId, userId);
    assertCanUpdateTask(task, isManager, userId, changes);
    assertAssigneeOnProject(project, changes.assigneeId);

    const { title, description, type, status, priority, assigneeId, dueDate } = changes;
    return prisma.task.update({
        where: { id: taskId },
        data: { title, description, type, status, priority, assigneeId, dueDate },
        include: { assignee: true },
    });
};

export const remove = async (userId: string, taskIds: string[]) => {
    const ids = [...new Set(taskIds)];
    const tasks = await prisma.task.findMany({ where: { id: { in: ids } }, select: { projectId: true } });
    if (tasks.length !== ids.length) throw AppError.notFound("Task not found");

    for (const projectId of new Set(tasks.map((task) => task.projectId))) {
        await requireProjectManager(projectId, userId);
    }

    await prisma.task.deleteMany({ where: { id: { in: ids } } });
};
