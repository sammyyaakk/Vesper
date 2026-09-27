import prisma from "../configs/prisma.js";
import type { AddCommentInput } from "../schemas/comment.js";
import type { PageQuery } from "../schemas/query.js";
import { pageArgs, toPage } from "../utils/pagination.js";
import { requireTaskAccess } from "./authorization.js";

export const add = async (userId: string, { taskId, content }: AddCommentInput) => {
    await requireTaskAccess(taskId, userId);
    return prisma.comment.create({ data: { taskId, content, userId }, include: { user: true } });
};

export const listForTask = async (userId: string, taskId: string) => {
    await requireTaskAccess(taskId, userId);
    return prisma.comment.findMany({ where: { taskId }, include: { user: true } });
};

export const listPage = async (userId: string, taskId: string, query: PageQuery) => {
    await requireTaskAccess(taskId, userId);
    const rows = await prisma.comment.findMany({
        where: { taskId },
        include: { user: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        ...pageArgs(query),
    });
    return toPage(rows, query.limit);
};
