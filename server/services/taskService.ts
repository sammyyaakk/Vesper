import { logger } from "../configs/logger.js";
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

type TaskEvent =
    | { name: "app/task.assigned"; data: { taskId: string; assigneeId: string } }
    | { name: "app/task.due-date.set"; data: { taskId: string; dueDate: string } }
    | { name: "app/task.deleted"; data: { taskId: string } };

// Best-effort: the task is already saved, so a failed notification is logged rather than failing the request
const publish = async (events: TaskEvent[]) => {
    if (events.length === 0) return;
    try {
        await inngest.send(events);
    } catch (err) {
        logger.error({ err, events: events.map((e) => e.name) }, "Failed to publish task events");
    }
};

const dueDateSet = (taskId: string, dueDate: Date): TaskEvent => ({
    name: "app/task.due-date.set",
    data: { taskId, dueDate: dueDate.toISOString() },
});

const assertAssigneeOnProject = (project: Parameters<typeof isProjectMember>[0], assigneeId: string | null | undefined) => {
    if (assigneeId && !isProjectMember(project, assigneeId)) {
        throw AppError.badRequest("Assignee must be a member of this project");
    }
};

export const create = async (userId: string, input: CreateTaskInput) => {
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

    const events: TaskEvent[] = [dueDateSet(task.id, task.dueDate)];
    if (task.assigneeId && task.assigneeId !== userId) {
        events.push({ name: "app/task.assigned", data: { taskId: task.id, assigneeId: task.assigneeId } });
    }
    await publish(events);

    return taskWithAssignee;
};

export const update = async (userId: string, taskId: string, changes: UpdateTaskInput) => {
    const { task, project, isManager } = await requireTaskAccess(taskId, userId);
    assertCanUpdateTask(task, isManager, userId, changes);
    assertAssigneeOnProject(project, changes.assigneeId);

    const { title, description, type, status, priority, assigneeId, dueDate } = changes;
    const updated = await prisma.task.update({
        where: { id: taskId },
        data: { title, description, type, status, priority, assigneeId, dueDate },
        include: { assignee: true },
    });

    const events: TaskEvent[] = [];
    if (dueDate && dueDate.getTime() !== task.dueDate.getTime()) events.push(dueDateSet(taskId, dueDate));
    if (assigneeId && assigneeId !== task.assigneeId && assigneeId !== userId) {
        events.push({ name: "app/task.assigned", data: { taskId, assigneeId } });
    }
    await publish(events);

    return updated;
};

export const remove = async (userId: string, taskIds: string[]) => {
    const ids = [...new Set(taskIds)];
    const tasks = await prisma.task.findMany({ where: { id: { in: ids } }, select: { projectId: true } });
    if (tasks.length !== ids.length) throw AppError.notFound("Task not found");

    for (const projectId of new Set(tasks.map((task) => task.projectId))) {
        await requireProjectManager(projectId, userId);
    }

    await prisma.task.deleteMany({ where: { id: { in: ids } } });
    await publish(ids.map((taskId) => ({ name: "app/task.deleted", data: { taskId } })));
};
