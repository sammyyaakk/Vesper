import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { createTaskSchema, deleteTasksSchema, taskParamsSchema, updateTaskSchema } from "../schemas/task.js";
import { commentListQuerySchema } from "../schemas/query.js";
import * as commentService from "../services/commentService.js";
import * as taskService from "../services/taskService.js";
import { parse } from "../utils/validation.js";

export const createTask = async (req: Request, res: Response) => {
    const input = parse(createTaskSchema, req.body);
    const task = await taskService.create(getUserId(req), input);
    return res.json({ task, message: "Task created successfully" });
};

export const updateTask = async (req: Request, res: Response) => {
    const { id } = parse(taskParamsSchema, req.params);
    const task = await taskService.update(getUserId(req), id, parse(updateTaskSchema, req.body));
    return res.json({ message: "Task updated successfully", task });
};

export const deleteTask = async (req: Request, res: Response) => {
    const { tasksIds } = parse(deleteTasksSchema, req.body);
    await taskService.remove(getUserId(req), tasksIds);
    return res.json({ message: "Task deleted successfully" });
};

export const getTask = async (req: Request, res: Response) => {
    const { id } = parse(taskParamsSchema, req.params);
    return res.json({ task: await taskService.get(getUserId(req), id) });
};

export const getTaskCommentsPage = async (req: Request, res: Response) => {
    const { id } = parse(taskParamsSchema, req.params);
    const query = parse(commentListQuerySchema, req.query);
    const { items, nextCursor, endCursor } = await commentService.listPage(getUserId(req), id, query);
    return res.json({ comments: items, nextCursor, endCursor });
};
