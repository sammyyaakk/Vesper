import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { addCommentSchema, commentParamsSchema } from "../schemas/comment.js";
import * as commentService from "../services/commentService.js";
import { parse } from "../utils/validation.js";

export const addComment = async (req: Request, res: Response) => {
    const comment = await commentService.add(getUserId(req), parse(addCommentSchema, req.body));
    return res.json({ comment });
};

export const getTaskComments = async (req: Request, res: Response) => {
    const { taskId } = parse(commentParamsSchema, req.params);
    const comments = await commentService.listForTask(taskId);
    return res.json({ comments });
};
