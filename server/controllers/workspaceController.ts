import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { legacyErrorMessage } from "../utils/legacyError.js";
import prisma from "../configs/prisma.js";

// Get all workspaces for user
export const getUserWorkspaces = async (req: Request, res: Response) => {
    try {

        const userId = getUserId(req);
        const workspaces = await prisma.workspace.findMany({
            where: {
                members: { some: { userId: userId } }
            },
            include: {
                members: { include: { user: true } },
                projects: {
                    include: {
                        tasks: { include: { assignee: true, comments: { include: { user: true } } } },
                        members: { include: { user: true } }
                    }
                },
                owner: true
            }
        });
        return res.json({ workspaces });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: legacyErrorMessage(error) });
    }
};