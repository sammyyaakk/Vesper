import { z } from "zod";
import { AppError } from "./AppError.js";

export const parse = <T extends z.ZodType>(schema: T, data: unknown): z.output<T> => {
    const result = schema.safeParse(data);
    if (result.success) return result.data;

    const errors = result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    const [first] = errors;
    const message = first?.path ? `${first.path}: ${first.message}` : (first?.message ?? "Invalid request");
    throw AppError.badRequest(message, errors);
};
