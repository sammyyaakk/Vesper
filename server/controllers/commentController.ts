import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { addCommentSchema } from "../schemas/comment.js";
import * as commentService from "../services/commentService.js";
import { parse } from "../utils/validation.js";

export const addComment = async (req: Request, res: Response) => {
    const comment = await commentService.add(getUserId(req), parse(addCommentSchema, req.body));
    return res.json({ comment });
};
