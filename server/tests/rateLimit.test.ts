import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { redis } from "../configs/redis.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { as } from "./helpers/api.js";
import { createTeam } from "./helpers/factories.js";

const MINUTE = 60_000;

// A tiny app around the middleware, with a controllable clock
const buildApp = (options: Partial<Parameters<typeof rateLimit>[0]> = {}) => {
    const clock = { now: 10 * MINUTE };
    const app = express();
    app.use(rateLimit({ name: "test", limit: 3, windowSeconds: 60, now: () => clock.now, ...options }));
    app.all("/", (_req, res) => {
        res.json({ ok: true });
    });
    return { app, clock };
};

const hit = (app: express.Express, user = "u1", method: "get" | "post" = "get") => request(app)[method]("/").set("x-test-user-id", user);

describe("rateLimit middleware", () => {
    it("allows up to the limit, then answers 429 with Retry-After", async () => {
        const { app } = buildApp();

        const allowed = [await hit(app), await hit(app), await hit(app)];
        const blocked = await hit(app);

        expect(allowed.map((r) => r.status)).toEqual([200, 200, 200]);
        expect(allowed.map((r) => r.headers["ratelimit-remaining"])).toEqual(["2", "1", "0"]);
        expect(allowed[0]!.headers["ratelimit-limit"]).toBe("3");
        expect(blocked.status).toBe(429);
        expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
        expect(blocked.body.message).toMatch(/too many requests/i);
    });

    it("counts each user separately", async () => {
        const { app } = buildApp();
        for (let i = 0; i < 3; i++) await hit(app, "u1");

        expect((await hit(app, "u1")).status).toBe(429);
        expect((await hit(app, "u2")).status).toBe(200);
    });

    it("doesn't let a burst at a window boundary double the limit (sliding window)", async () => {
        const { app, clock } = buildApp();
        clock.now = 10 * MINUTE + 59_000;
        for (let i = 0; i < 3; i++) expect((await hit(app)).status).toBe(200);

        clock.now = 11 * MINUTE + 1_000;
        expect((await hit(app)).status).toBe(429);

        clock.now = 11 * MINUTE + 40_000;
        expect((await hit(app)).status).toBe(200);
    });

    it("recovers fully after a quiet window", async () => {
        const { app, clock } = buildApp();
        for (let i = 0; i < 3; i++) await hit(app);
        expect((await hit(app)).status).toBe(429);

        clock.now += 2 * MINUTE;
        expect((await hit(app)).status).toBe(200);
    });

    it("doesn't count requests it rejects", async () => {
        const { app, clock } = buildApp();
        for (let i = 0; i < 3; i++) await hit(app);
        for (let i = 0; i < 10; i++) await hit(app);

        clock.now += 2 * MINUTE;
        const after = await hit(app);
        expect(after.status).toBe(200);
        expect(after.headers["ratelimit-remaining"]).toBe("2");
    });

    it("can skip requests (e.g. reads for a write limiter)", async () => {
        const { app } = buildApp({ skip: (req) => req.method === "GET" });
        for (let i = 0; i < 5; i++) expect((await hit(app, "u1", "get")).status).toBe(200);
        for (let i = 0; i < 3; i++) expect((await hit(app, "u1", "post")).status).toBe(200);
        expect((await hit(app, "u1", "post")).status).toBe(429);
    });

    it("fails open when Redis errors", async () => {
        const broken = { slidingWindow: () => Promise.reject(new Error("Connection is closed.")) };
        const { app } = buildApp({ client: broken as unknown as NonNullable<typeof redis> });

        for (let i = 0; i < 5; i++) expect((await hit(app)).status).toBe(200);
    });
});

describe("rate limits on the API", () => {
    it("limits writes per user and leaves reads and other users alone", async () => {
        const { lead, member } = await createTeam();
        const missing = "00000000-0000-4000-8000-000000000000";

        const statuses: number[] = [];
        for (let i = 0; i < 61; i++) statuses.push((await as(lead.id).post("/api/tasks/delete").send({ tasksIds: [missing] })).status);

        expect(statuses.slice(0, 60).every((status) => status === 404)).toBe(true);
        expect(statuses[60]).toBe(429);
        expect((await as(lead.id).get("/api/workspaces")).status).toBe(200);
        expect((await as(member.id).post("/api/tasks/delete").send({ tasksIds: [missing] })).status).toBe(404);
    });

    it("sends rate-limit headers on API responses", async () => {
        const { member } = await createTeam();
        const res = await as(member.id).get("/api/workspaces");
        expect(res.headers["ratelimit-limit"]).toBe("300");
        expect(res.headers["ratelimit-remaining"]).toBe("299");
    });
});
