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
    client.on("error", (err) => logger.warn({ err: err.message }, "Redis error"));
    return client;
};

export const redis = createClient();
