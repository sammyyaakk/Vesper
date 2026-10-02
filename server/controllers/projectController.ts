import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { addMemberSchema, createProjectSchema, memberParamsSchema, projectParamsSchema, setMemberRoleSchema, updateProjectSchema } from "../schemas/project.js";
import { calendarQuerySchema, taskListQuerySchema } from "../schemas/query.js";
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
    const { email, role } = parse(addMemberSchema, req.body);
    const member = await projectService.addMember(getUserId(req), projectId, email, role);
    return res.json({ member, message: "Member added successfully" });
};

export const setMemberRole = async (req: Request, res: Response) => {
    const { projectId, userId } = parse(memberParamsSchema, req.params);
    const { role } = parse(setMemberRoleSchema, req.body);
    const member = await projectService.setMemberRole(getUserId(req), projectId, userId, role);
    return res.json({ member, message: "Role updated" });
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

export const getProjectStats = async (req: Request, res: Response) => {
    const { projectId } = parse(projectParamsSchema, req.params);
    return res.json({ stats: await projectService.stats(getUserId(req), projectId) });
};

export const getProjectCalendar = async (req: Request, res: Response) => {
    const { projectId } = parse(projectParamsSchema, req.params);
    const query = parse(calendarQuerySchema, req.query);
    return res.json(await projectService.calendar(getUserId(req), projectId, query));
};
