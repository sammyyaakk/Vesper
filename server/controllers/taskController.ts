import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import * as taskService from "../services/taskService.js";

export const createTask = async (req: Request, res: Response) => {
    const task = await taskService.create(getUserId(req), req.body, req.get("origin"));
    return res.json({ task, message: "Task created successfully" });
};

export const updateTask = async (req: Request<{ id: string }>, res: Response) => {
    const task = await taskService.update(getUserId(req), req.params.id, req.body);
    return res.json({ message: "Task updated successfully", task });
};

export const deleteTask = async (req: Request, res: Response) => {
    await taskService.remove(getUserId(req), req.body.tasksIds);
    return res.json({ message: "Task deleted successfully" });
};
