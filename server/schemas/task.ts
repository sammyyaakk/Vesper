import { Priority, TaskStatus, TaskType } from "@prisma/client";
import { z } from "zod";
import { clearableText, clerkId, optionalText, requiredDate, uuid } from "./common.js";

const editableTaskFields = {
    title: z.string().trim().min(1, "Title is required").max(200),
    description: optionalText,
    type: z.enum(TaskType).optional(),
    status: z.enum(TaskStatus).optional(),
    priority: z.enum(Priority).optional(),
    assigneeId: z.preprocess((value) => (value === "" ? null : value), clerkId.nullish()),
    dueDate: requiredDate,
};

export const createTaskSchema = z.object({ projectId: uuid, ...editableTaskFields });

// Only these fields can change; anything else in the body (projectId, createdAt, …) is dropped
export const updateTaskSchema = z.object({ ...editableTaskFields, description: clearableText }).partial();

export const taskParamsSchema = z.object({ id: uuid });

export const deleteTasksSchema = z.object({
    tasksIds: z.array(uuid).min(1, "Select at least one task").max(100),
});

export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;
