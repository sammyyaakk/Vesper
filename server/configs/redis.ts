import { Redis, type RedisOptions } from "ioredis";
import { logger } from "./logger.js";

// Fail fast while disconnected, so callers can fall back instead of waiting
export const FAIL_FAST: RedisOptions = { enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 2000 };

// ioredis emits an error on every reconnect attempt; log once per outage. A refused connection is an AggregateError with an empty message, so log the code too.
export const createRedisClient = (url: string, purpose: string, options: RedisOptions = FAIL_FAST) => {
    const client = new Redis(url, options);
    let down = false;
    client.on("error", (err: Error & { code?: string }) => {
        if (down) return;
        down = true;
        logger.warn({ code: err.code, err: err.message, purpose }, "Redis unavailable until it reconnects");
    });
    client.on("ready", () => {
        if (!down) return;
        down = false;
        logger.info({ purpose }, "Redis reconnected");
    });
    return client;
};

// Redis backs rate limiting, caching and cross-instance socket events; if it's missing or down, those are skipped (fail open)
const createSharedClient = () => {
    const url = process.env.REDIS_URL;
    if (!url) {
        logger.warn("REDIS_URL not set: rate limiting, caching and cross-instance events are disabled");
        return null;
    }
    return createRedisClient(url, "rate limiting and caching");
};

export const redis = createSharedClient();
