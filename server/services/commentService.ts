import prisma from "../configs/prisma.js";
import type { AddCommentInput } from "../schemas/comment.js";
import { AppError } from "../utils/AppError.js";
import { requireProjectMember } from "./authorization.js";

export const add = async (userId: string, { taskId, content }: AddCommentInput) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
    });

    if (!task) throw AppError.notFound("Task not found");

    await requireProjectMember(task.projectId, userId);

    return prisma.comment.create({ data: { taskId, content, userId }, include: { user: true } });
};

// TODO(phase-2) #1
export const listForTask = (taskId: string) =>
    prisma.comment.findMany({ where: { taskId }, include: { user: true } });
