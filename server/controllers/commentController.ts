import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import * as commentService from "../services/commentService.js";

export const addComment = async (req: Request, res: Response) => {
    const comment = await commentService.add(getUserId(req), req.body);
    return res.json({ comment });
};

export const getTaskComments = async (req: Request<{ taskId: string }>, res: Response) => {
    const comments = await commentService.listForTask(req.params.taskId);
    return res.json({ comments });
};
