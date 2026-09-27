import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { addMemberSchema, createProjectSchema, projectParamsSchema, updateProjectSchema } from "../schemas/project.js";
import { taskListQuerySchema } from "../schemas/query.js";
import * as projectService from "../services/projectService.js";
import { parse } from "../utils/validation.js";

export const createProject = async (req: Request, res: Response) => {
    const project = await projectService.create(getUserId(req), parse(createProjectSchema, req.body));
    return res.json({ project, message: "Project created successfully" });
};

export const updateProject = async (req: Request, res: Response) => {
    const project = await projectService.update(getUserId(req), parse(updateProjectSchema, req.body));
    return res.json({ project, message: "Project updated successfully" });
};

export const addMember = async (req: Request, res: Response) => {
    const { projectId } = parse(projectParamsSchema, req.params);
    const { email } = parse(addMemberSchema, req.body);
    const member = await projectService.addMember(getUserId(req), projectId, email);
    return res.json({ member, message: "Member added successfully" });
};

export const getProject = async (req: Request, res: Response) => {
    const { projectId } = parse(projectParamsSchema, req.params);
    return res.json({ project: await projectService.get(getUserId(req), projectId) });
};

export const getProjectTasks = async (req: Request, res: Response) => {
    const { projectId } = parse(projectParamsSchema, req.params);
    const query = parse(taskListQuerySchema, req.query);
    const { items, nextCursor } = await projectService.listTasks(getUserId(req), projectId, query);
    return res.json({ tasks: items, nextCursor });
};
