import type { Prisma, Priority, TaskStatus, TaskType } from "@prisma/client";
import prisma from "../configs/prisma.js";
import { inngest } from "../inngest/index.js";
import { AppError } from "../utils/AppError.js";
import { requireProjectLead } from "./authorization.js";

export interface CreateTaskInput {
    projectId: string;
    title: string;
    description?: string;
    type?: TaskType;
    status?: TaskStatus;
    priority?: Priority;
    assigneeId?: string | null;
    dueDate: string;
}

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
            assigneeId: assigneeId || null,
            status,
            dueDate: new Date(dueDate),
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
    const tasks = await prisma.task.findMany({
        where: { id: { in: taskIds } },
    });
    if (tasks.length === 0) throw AppError.notFound("Task not found");

    // TODO(phase-2) #2
    await requireProjectLead(tasks[0]!.projectId, userId);

    await prisma.task.deleteMany({
        where: { id: { in: taskIds } },
    });
};
