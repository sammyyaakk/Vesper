import { Priority, ProjectStatus } from "@prisma/client";
import { z } from "zod";
import { clerkId, optionalDate, optionalText, uuid } from "./common.js";

const name = z.string().trim().min(1, "Name is required").max(100);

const projectFields = {
    workspaceId: clerkId,
    description: optionalText,
    status: z.enum(ProjectStatus).optional(),
    priority: z.enum(Priority).optional(),
    startDate: optionalDate,
    endDate: optionalDate,
};

const endOnOrAfterStart = ({ startDate, endDate }: { startDate?: Date; endDate?: Date }) =>
    !startDate || !endDate || endDate >= startDate;

const endDateIssue = { message: "End date must be on or after the start date", path: ["endDate"] };

export const createProjectSchema = z
    .object({
        ...projectFields,
        name,
        teamLeadEmail: z.email("Team lead must be a valid email"),
        teamMembers: z.array(z.email()).max(100).optional(),
    })
    .refine(endOnOrAfterStart, endDateIssue);

export const updateProjectSchema = z
    .object({ ...projectFields, id: uuid, name: name.optional() })
    .refine(endOnOrAfterStart, endDateIssue);

export const projectParamsSchema = z.object({ projectId: uuid });

export const addMemberSchema = z.object({ email: z.email("Must be a valid email") });

export type CreateProjectInput = z.output<typeof createProjectSchema>;
export type UpdateProjectInput = z.output<typeof updateProjectSchema>;
