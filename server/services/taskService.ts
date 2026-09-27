import type { Prisma } from "@prisma/client";
import prisma from "../configs/prisma.js";
import { inngest } from "../inngest/index.js";
import type { CreateTaskInput } from "../schemas/task.js";
import { AppError } from "../utils/AppError.js";
import { requireProjectLead } from "./authorization.js";

export const create = async (userId: string, input: CreateTaskInput, origin?: string) => {
    const { projectId, title, description, type, status, priority, assigneeId, dueDate } = input;

    const project = await requireProjectLead(projectId, userId);
    if (assigneeId && !project.members.find((member) => member.user.id === assigneeId)) {
        throw AppError.forbidden("assignee is not a member of the project / workspace");
    }

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

// TODO(phase-2) #3
export const update = async (userId: string, taskId: string, data: Prisma.TaskUncheckedUpdateInput) => {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw AppError.notFound("Task not found");

    await requireProjectLead(task.projectId, userId);

    return prisma.task.update({
        where: { id: taskId },
        data,
    });
};

export const remove = async (userId: string, taskIds: string[]) => {
    const ids = [...new Set(taskIds)];
    const tasks = await prisma.task.findMany({ where: { id: { in: ids } }, select: { projectId: true } });
    if (tasks.length !== ids.length) throw AppError.notFound("Task not found");

    for (const projectId of new Set(tasks.map((task) => task.projectId))) {
        await requireProjectLead(projectId, userId);
    }

    await prisma.task.deleteMany({ where: { id: { in: ids } } });
};
