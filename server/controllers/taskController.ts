import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { createTaskSchema, deleteTasksSchema, taskParamsSchema } from "../schemas/task.js";
import * as taskService from "../services/taskService.js";
import { parse } from "../utils/validation.js";

export const createTask = async (req: Request, res: Response) => {
    const input = parse(createTaskSchema, req.body);
    const task = await taskService.create(getUserId(req), input, req.get("origin"));
    return res.json({ task, message: "Task created successfully" });
};

export const updateTask = async (req: Request, res: Response) => {
    const { id } = parse(taskParamsSchema, req.params);
    const task = await taskService.update(getUserId(req), id, req.body);
    return res.json({ message: "Task updated successfully", task });
};

export const deleteTask = async (req: Request, res: Response) => {
    const { tasksIds } = parse(deleteTasksSchema, req.body);
    await taskService.remove(getUserId(req), tasksIds);
    return res.json({ message: "Task deleted successfully" });
};
