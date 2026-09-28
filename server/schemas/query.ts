import { Priority, TaskStatus, TaskType } from "@prisma/client";
import { z } from "zod";
import { cursorSchema } from "../utils/pagination.js";
import { clerkId } from "./common.js";

const page = {
    cursor: cursorSchema.optional(),
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

const DAY_MS = 86_400_000;
const MAX_CALENDAR_DAYS = 62;

export const calendarQuerySchema = z
    .object({ from: z.coerce.date(), to: z.coerce.date() })
    .refine(({ from, to }) => to >= from, { message: "Must be on or after from", path: ["to"] })
    .refine(({ from, to }) => to.getTime() - from.getTime() <= MAX_CALENDAR_DAYS * DAY_MS, {
        message: `The window can be at most ${MAX_CALENDAR_DAYS} days`,
        path: ["to"],
    });

export type CalendarQuery = z.output<typeof calendarQuerySchema>;
