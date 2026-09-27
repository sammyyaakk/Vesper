import prisma from "../configs/prisma.js";
import { AppError } from "../utils/AppError.js";

export interface AddCommentInput {
    taskId: string;
    content: string;
}

export const add = async (userId: string, { taskId, content }: AddCommentInput) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
    });

    const project = await prisma.project.findUnique({
        // TODO(phase-2) #7: handle a missing task
        where: { id: task!.projectId },
        include: { members: { include: { user: true } } },
    });
    if (!project) throw AppError.notFound("Project not found");

    if (!project.members.find((member) => member.userId === userId)) {
        throw AppError.forbidden("You are not member of this project");
    }

    return prisma.comment.create({ data: { taskId, content, userId }, include: { user: true } });
};

// TODO(phase-2) #1
export const listForTask = (taskId: string) =>
    prisma.comment.findMany({ where: { taskId }, include: { user: true } });
