import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { AppError } from "../utils/AppError.js";
import prisma from "../configs/prisma.js";

// Add comment
export const addComment = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { content,taskId } = req.body;

    // check if user is projectmember
    const task = await prisma.task.findUnique({
        where: { id: taskId },
    });
    
    const project = await prisma.project.findUnique({
        // TODO(phase-2) #7: handle a missing task
        where: { id: task!.projectId },
        include: { members: { include: { user: true } } },
    });

    if (!project) {
        throw AppError.notFound("Project not found");
    }
    const member = project.members.find((member) => member.userId === userId);
    if (!member) {
        throw AppError.forbidden("You are not member of this project");
    }

    const comment = await prisma.comment.create({ data: { taskId, content, userId }, include: { user: true } });
    
    return res.json({comment});
};

// Get comments for task
export const getTaskComments = async (req: Request<{ taskId: string }>, res: Response) => {
    const { taskId } = req.params;
    const comments = await prisma.comment.findMany({ where: { taskId }, include: { user: true } });
    return res.json({ comments });
};
