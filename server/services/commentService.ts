import prisma from "../configs/prisma.js";
import { requireProjectMember } from "./authorization.js";

export interface AddCommentInput {
    taskId: string;
    content: string;
}

export const add = async (userId: string, { taskId, content }: AddCommentInput) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
    });

    // TODO(phase-2) #7: handle a missing task
    await requireProjectMember(task!.projectId, userId);

    return prisma.comment.create({ data: { taskId, content, userId }, include: { user: true } });
};

// TODO(phase-2) #1
export const listForTask = (taskId: string) =>
    prisma.comment.findMany({ where: { taskId }, include: { user: true } });
