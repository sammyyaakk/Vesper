import { z } from "zod";

// HTML forms send "" for empty fields and the API returns null for unset ones
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const uuid = z.uuid("Must be a valid ID");

export const clerkId = z.string().trim().min(1).max(100);

export const optionalText = z.preprocess(blankToUndefined, z.string().trim().max(5000).optional());

export const optionalDate = z.preprocess(blankToUndefined, z.coerce.date("Must be a valid date").optional());

export const requiredDate = z.preprocess(
    blankToUndefined,
    z.coerce.date({ error: (issue) => (issue.input === undefined ? "Required" : "Must be a valid date") }),
);
