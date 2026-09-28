import { Redis } from "ioredis";
import { logger } from "./logger.js";

// Redis backs rate limiting and caching only; if it's missing or down, both are skipped (fail open)
const createClient = () => {
    const url = process.env.REDIS_URL;
    if (!url) {
        logger.warn("REDIS_URL not set: rate limiting and caching are disabled");
        return null;
    }
    const client = new Redis(url, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
    });
    // ioredis emits an error on every reconnect attempt; log once per outage. A refused connection is an AggregateError with an empty message, so log the code too.
    let down = false;
    client.on("error", (err: Error & { code?: string }) => {
        if (down) return;
        down = true;
        logger.warn({ code: err.code, err: err.message }, "Redis unavailable: rate limiting and caching are skipped until it reconnects");
    });
    client.on("ready", () => {
        if (!down) return;
        down = false;
        logger.info("Redis reconnected");
    });
    return client;
};

export const redis = createClient();
