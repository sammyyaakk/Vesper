import { Priority, TaskStatus, TaskType } from "@prisma/client";
import { z } from "zod";
import { clerkId, optionalText, requiredDate, uuid } from "./common.js";

export const createTaskSchema = z.object({
    projectId: uuid,
    title: z.string().trim().min(1, "Title is required").max(200),
    description: optionalText,
    type: z.enum(TaskType).optional(),
    status: z.enum(TaskStatus).optional(),
    priority: z.enum(Priority).optional(),
    assigneeId: z.preprocess((value) => (value === "" ? null : value), clerkId.nullish()),
    dueDate: requiredDate,
});

export const taskParamsSchema = z.object({ id: uuid });

export const deleteTasksSchema = z.object({
    tasksIds: z.array(uuid).min(1, "Select at least one task").max(100),
});

export type CreateTaskInput = z.output<typeof createTaskSchema>;
