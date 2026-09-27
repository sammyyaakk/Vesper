import type { PageQuery } from "../schemas/query.js";

// Keyset pagination: fetch one extra row to know whether another page exists
export const pageArgs = ({ cursor, limit }: PageQuery) => ({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
});

export const toPage = <T extends { id: string }>(rows: T[], limit: number) => {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
};
