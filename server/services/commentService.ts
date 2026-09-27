import prisma from "../configs/prisma.js";
import type { AddCommentInput } from "../schemas/comment.js";
import { AppError } from "../utils/AppError.js";
import { requireProjectMember, requireTaskProjectMember } from "./authorization.js";

export const add = async (userId: string, { taskId, content }: AddCommentInput) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
    });

    if (!task) throw AppError.notFound("Task not found");

    await requireProjectMember(task.projectId, userId);

    return prisma.comment.create({ data: { taskId, content, userId }, include: { user: true } });
};

export const listForTask = async (userId: string, taskId: string) => {
    await requireTaskProjectMember(taskId, userId);
    return prisma.comment.findMany({ where: { taskId }, include: { user: true } });
};
