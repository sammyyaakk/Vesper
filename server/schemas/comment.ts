import { z } from "zod";
import { uuid } from "./common.js";

export const addCommentSchema = z.object({
    taskId: uuid,
    content: z.string().trim().min(1, "Comment can't be empty").max(5000),
});

export type AddCommentInput = z.output<typeof addCommentSchema>;
