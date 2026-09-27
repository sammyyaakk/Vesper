import { Priority, TaskStatus, TaskType } from "@prisma/client";
import { z } from "zod";
import { clerkId, uuid } from "./common.js";

const page = {
    cursor: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
};

export const workspaceParamsSchema = z.object({ workspaceId: clerkId });

export const taskListQuerySchema = z.object({
    ...page,
    status: z.enum(TaskStatus).optional(),
    type: z.enum(TaskType).optional(),
    priority: z.enum(Priority).optional(),
    assignee: z.union([z.literal("me"), z.literal("none"), clerkId]).optional(),
});

export const commentListQuerySchema = z.object(page);

export type TaskListQuery = z.output<typeof taskListQuerySchema>;
export type PageQuery = z.output<typeof commentListQuerySchema>;
