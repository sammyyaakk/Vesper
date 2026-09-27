import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import * as workspaceService from "../services/workspaceService.js";

export const getUserWorkspaces = async (req: Request, res: Response) => {
    const workspaces = await workspaceService.listForUser(getUserId(req));
    return res.json({ workspaces });
};
