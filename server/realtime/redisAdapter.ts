import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import { logger } from "../configs/logger.js";
import { createRedisClient, FAIL_FAST } from "../configs/redis.js";

// The adapter calls these without awaiting them; a rejection (Redis down, or closing) would be unhandled and crash the process
const UNAWAITED = ["publish", "subscribe", "psubscribe", "unsubscribe", "punsubscribe"] as const;

const catchRejections = (client: Redis) => {
    for (const method of UNAWAITED) {
        const original = (client[method] as (...args: unknown[]) => Promise<unknown>).bind(client);
        (client as unknown as Record<string, unknown>)[method] = (...args: unknown[]) =>
            original(...args).catch((err: Error) => logger.debug({ err: err.message, method }, "socket relay command failed"));
    }
    return client;
};

// Relays broadcasts and room changes between API instances through Redis pub/sub.
// During an outage, events still reach sockets on the same instance.
export const createRedisAdapter = (url: string, httpServer: HttpServer) => {
    const pub = catchRejections(createRedisClient(url, "socket events (publish)", FAIL_FAST));
    // Subscriptions queue until Redis is reachable, and ioredis resubscribes after a reconnect
    const sub = catchRejections(createRedisClient(url, "socket events (subscribe)", { maxRetriesPerRequest: null }));

    httpServer.once("close", () => {
        pub.disconnect();
        sub.disconnect();
    });
    return createAdapter(pub, sub);
};
