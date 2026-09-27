import prisma from "../configs/prisma.js";

export const listForUser = (userId: string) =>
    prisma.workspace.findMany({
        where: { members: { some: { userId } } },
        include: {
            members: { include: { user: true } },
            projects: {
                include: {
                    tasks: { include: { assignee: true, comments: { include: { user: true } } } },
                    members: { include: { user: true } },
                },
            },
            owner: true,
        },
    });
