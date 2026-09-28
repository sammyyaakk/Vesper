import type { NextFunction, Request, Response } from "express";
import { beforeEach, vi } from "vitest";
import { assertTestDatabase, assertTestRedis } from "./testDatabase.js";

vi.mock("@clerk/express", () => ({
    clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    getAuth: (req: Request) => ({ userId: req.header("x-test-user-id") ?? null }),
}));

// Tests must never send real email
vi.mock("../../configs/nodemailer.js", () => ({ default: vi.fn().mockResolvedValue({ messageId: "test" }) }));

const { inngest } = await import("../../inngest/index.js");
const { default: prisma } = await import("../../configs/prisma.js");
const { redis } = await import("../../configs/redis.js");

if (redis) {
    assertTestRedis();
    if (redis.status !== "ready") await new Promise((resolve) => redis.once("ready", resolve));
}

export const inngestSend = vi.spyOn(inngest, "send");

beforeEach(async () => {
    assertTestDatabase();
    await redis?.flushdb();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: [] });
    await prisma.$executeRawUnsafe(
        'TRUNCATE "Comment", "Task", "ProjectMember", "Project", "WorkspaceMember", "Workspace", "User" RESTART IDENTITY CASCADE',
    );
});
