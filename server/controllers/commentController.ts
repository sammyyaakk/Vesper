import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { legacyErrorMessage } from "../utils/legacyError.js";
import prisma from "../configs/prisma.js";

// Add comment
export const addComment = async (req: Request, res: Response) => {
    try {
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
            return res.status(404).json({ message: "Project not found" });
        }
        const member = project.members.find((member) => member.userId === userId);
        if (!member) {
            return res.status(403).json({ message: "You are not member of this project" });
        }

        const comment = await prisma.comment.create({ data: { taskId, content, userId }, include: { user: true } });
        
        return res.json({comment});
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: legacyErrorMessage(error) });
    }
};

// Get comments for task
export const getTaskComments = async (req: Request<{ taskId: string }>, res: Response) => {
    try {
        const { taskId } = req.params;
        const comments = await prisma.comment.findMany({ where: { taskId }, include: { user: true } });
        return res.json({ comments });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: legacyErrorMessage(error) });
    }
};
