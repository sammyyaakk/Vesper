import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { workspaceParamsSchema } from "../schemas/query.js";
import * as workspaceService from "../services/workspaceService.js";
import { parse } from "../utils/validation.js";

export const getUserWorkspaces = async (req: Request, res: Response) => {
    const workspaces = await workspaceService.listForUser(getUserId(req));
    return res.json({ workspaces });
};

export const getWorkspace = async (req: Request, res: Response) => {
    const { workspaceId } = parse(workspaceParamsSchema, req.params);
    return res.json(await workspaceService.get(getUserId(req), workspaceId));
};

export const getWorkspaceProjects = async (req: Request, res: Response) => {
    const { workspaceId } = parse(workspaceParamsSchema, req.params);
    return res.json({ projects: await workspaceService.listProjects(getUserId(req), workspaceId) });
};

export const getWorkspaceSummary = async (req: Request, res: Response) => {
    const { workspaceId } = parse(workspaceParamsSchema, req.params);
    return res.json(await workspaceService.summary(getUserId(req), workspaceId));
};
