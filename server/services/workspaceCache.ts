import type { Redis } from "ioredis";
import { logger } from "../configs/logger.js";
import { redis as sharedRedis } from "../configs/redis.js";

const TTL_SECONDS = 60;

const versionKey = (workspaceId: string) => `ws:${workspaceId}:version`;

// Every key includes the workspace's version. A write bumps the version, so older entries are never read again and simply expire.
export const createWorkspaceCache = (client: Redis | null) => {
    // Values round-trip through JSON (dates come back as strings), so only use this for data that is sent as JSON as-is
    const cached = async <T>(workspaceId: string, view: string, load: () => Promise<T>): Promise<T> => {
        if (!client) return load();

        let key: string;
        try {
            const version = (await client.get(versionKey(workspaceId))) ?? "0";
            key = `cache:ws:${workspaceId}:v${version}:${view}`;
            const hit = await client.get(key);
            if (hit !== null) {
                logger.debug({ key }, "cache hit");
                return JSON.parse(hit) as T;
            }
        } catch (err) {
            logger.warn({ err, workspaceId, view }, "Cache unavailable; loading from the database");
            return load();
        }

        logger.debug({ key }, "cache miss");
        const value = await load();
        try {
            await client.set(key, JSON.stringify(value), "EX", TTL_SECONDS);
        } catch (err) {
            logger.warn({ err, key }, "Failed to store cache entry");
        }
        return value;
    };

    // Runs after the database write has succeeded, so a failure here is logged, not thrown; the TTL bounds how long data stays stale
    const invalidate = async (...workspaceIds: string[]) => {
        if (!client) return;
        try {
            await Promise.all([...new Set(workspaceIds)].map((id) => client.incr(versionKey(id))));
        } catch (err) {
            logger.warn({ err, workspaceIds }, "Failed to invalidate workspace cache");
        }
    };

    return { cached, invalidate };
};

export const { cached, invalidate: invalidateWorkspace } = createWorkspaceCache(sharedRedis);
