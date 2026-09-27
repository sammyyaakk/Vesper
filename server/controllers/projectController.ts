import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import * as projectService from "../services/projectService.js";

export const createProject = async (req: Request, res: Response) => {
    const project = await projectService.create(getUserId(req), req.body);
    return res.json({ project, message: "Project created successfully" });
};

export const updateProject = async (req: Request, res: Response) => {
    const project = await projectService.update(getUserId(req), req.body);
    return res.json({ project, message: "Project updated successfully" });
};

export const addMember = async (req: Request<{ projectId: string }>, res: Response) => {
    const member = await projectService.addMember(getUserId(req), req.params.projectId, req.body.email);
    return res.json({ member, message: "Member added successfully" });
};
