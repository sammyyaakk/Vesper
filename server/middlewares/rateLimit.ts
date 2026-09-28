import type { Request, RequestHandler } from "express";
import type { Redis, Result } from "ioredis";
import { getAuth } from "@clerk/express";
import { redis as sharedRedis } from "../configs/redis.js";

// Sliding-window counter: estimate = previous window × (share of it still inside the window) + current window.
// Runs as one Lua script so the check and the increment are atomic. Rejected requests aren't counted.
// Returns { allowed, used, msUntilWindowEnd, retryAfterMs }.
const SLIDING_WINDOW = `
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local current = math.floor(now / window)
local currentKey = KEYS[1] .. ":" .. current
local previous = tonumber(redis.call("GET", KEYS[1] .. ":" .. (current - 1)) or "0")
local count = tonumber(redis.call("GET", currentKey) or "0")
local intoWindow = now % window
local estimate = previous * (1 - intoWindow / window) + count

if estimate + 1 <= limit then
    redis.call("INCR", currentKey)
    redis.call("PEXPIRE", currentKey, window * 2)
    return { 1, math.ceil(estimate + 1), window - intoWindow, 0 }
end

local retry
if count + 1 <= limit then
    retry = math.ceil((1 - (limit - 1 - count) / previous) * window) - intoWindow
else
    retry = (window - intoWindow) + math.ceil((1 - (limit - 1) / count) * window)
end
return { 0, limit, window - intoWindow, math.max(retry, 1) }
`;

declare module "ioredis" {
    interface RedisCommander<Context> {
        slidingWindow(key: string, limit: number, windowMs: number, nowMs: number): Result<[number, number, number, number], Context>;
    }
}

const defined = new WeakSet<Redis>();
const withCommand = (client: Redis) => {
    if (!defined.has(client) && typeof client.defineCommand === "function") {
        client.defineCommand("slidingWindow", { numberOfKeys: 1, lua: SLIDING_WINDOW });
        defined.add(client);
    }
    return client;
};

interface RateLimitOptions {
    name: string;
    limit: number;
    windowSeconds: number;
    skip?: (req: Request) => boolean;
    now?: () => number;
    client?: Redis | null;
}

const identify = (req: Request) => {
    const userId = getAuth(req).userId;
    return userId ? `user:${userId}` : `ip:${req.ip}`;
};

export const rateLimit = ({ name, limit, windowSeconds, skip, now = Date.now, client = sharedRedis }: RateLimitOptions): RequestHandler => {
    const windowMs = windowSeconds * 1000;
    return async (req, res, next) => {
        if (!client || skip?.(req)) return next();

        try {
            const [allowed, used, msUntilWindowEnd, retryAfterMs] = await withCommand(client).slidingWindow(
                `rl:${name}:${identify(req)}`,
                limit,
                windowMs,
                now(),
            );
            res.setHeader("RateLimit-Limit", String(limit));
            res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - used)));
            res.setHeader("RateLimit-Reset", String(Math.ceil(msUntilWindowEnd / 1000)));

            if (!allowed) {
                const retryAfter = Math.ceil(retryAfterMs / 1000);
                res.setHeader("Retry-After", String(retryAfter));
                req.log?.warn({ limiter: name, retryAfter }, "Rate limit exceeded");
                res.status(429).json({ message: `Too many requests. Try again in ${retryAfter} seconds.` });
                return;
            }
        } catch (err) {
            req.log?.warn({ err, limiter: name }, "Rate limiter unavailable; allowing request");
        }
        next();
    };
};
