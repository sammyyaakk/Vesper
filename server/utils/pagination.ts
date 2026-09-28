import { z } from "zod";

// Keyset pagination on (createdAt, id). The cursor encodes both values, so the next page
// starts with an index range (createdAt <= c) instead of filtering from the first row.
export interface Keyset {
    createdAt: Date;
    id: string;
}

export const encodeCursor = ({ createdAt, id }: Keyset) => Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");

export const cursorSchema = z
    .string()
    .max(200)
    .transform((value, ctx): Keyset => {
        const [iso, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
        const createdAt = new Date(iso ?? "");
        if (!id || Number.isNaN(createdAt.getTime())) {
            ctx.addIssue({ code: "custom", message: "Invalid cursor" });
            return z.NEVER;
        }
        return { createdAt, id };
    });

export const after = (cursor: Keyset | undefined, direction: "asc" | "desc") => {
    if (!cursor) return {};
    const { createdAt, id } = cursor;
    return direction === "desc"
        ? { createdAt: { lte: createdAt }, OR: [{ createdAt: { lt: createdAt } }, { id: { lt: id } }] }
        : { createdAt: { gte: createdAt }, OR: [{ createdAt: { gt: createdAt } }, { id: { gt: id } }] };
};

export const orderBy = (direction: "asc" | "desc") => [{ createdAt: direction }, { id: direction }];

// Fetch limit + 1 rows: the extra one tells whether another page exists.
// endCursor points at the last returned item even on the final page, so a client can later ask for anything newer
export const toPage = <T extends Keyset>(rows: T[], limit: number) => {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? encodeCursor(last) : null, endCursor: last ? encodeCursor(last) : null };
};
