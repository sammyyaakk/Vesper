import type { Server as HttpServer } from "node:http";
import { verifyToken } from "@clerk/express";
import type { Comment, Task, User } from "@prisma/client";
import { Server } from "socket.io";
import { appUrl } from "../configs/appUrl.js";
import { logger } from "../configs/logger.js";
import prisma from "../configs/prisma.js";
import { clerkId, uuid } from "../schemas/common.js";
import { accessibleProjects, requireProjectAccess, requireWorkspaceMembership } from "../services/authorization.js";
import { AppError } from "../utils/AppError.js";
import { createRedisAdapter } from "./redisAdapter.js";

type JoinResult = { ok: true } | { ok: false; error: string };

interface ClientToServerEvents {
    "project:join": (projectId: unknown, ack: (result: JoinResult) => void) => void;
    "project:leave": (projectId: unknown, ack: () => void) => void;
    "workspace:join": (workspaceId: unknown, ack: (result: JoinResult) => void) => void;
    "workspace:leave": (workspaceId: unknown, ack: () => void) => void;
}

// Same shapes as the REST responses for these writes
export interface ServerToClientEvents {
    "task:created": (task: Task & { assignee: User | null }) => void;
    "task:updated": (task: Task & { assignee: User | null }) => void;
    "tasks:deleted": (payload: { projectId: string; taskIds: string[] }) => void;
    "comment:created": (comment: Comment & { user: User }) => void;
    // A notice, not data: clients refetch their workspace views (served from the cache)
    "workspace:changed": (payload: { workspaceId: string }) => void;
}

export interface SocketData {
    userId: string;
}

type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export const projectRoom = (projectId: string) => `project:${projectId}`;
export const workspaceRoom = (workspaceId: string) => `workspace:${workspaceId}`;
const userRoom = (userId: string) => `user:${userId}`;

// Set when the HTTP server starts; background jobs and tests without a server skip the socket side
let current: RealtimeServer | null = null;

// The session token comes in the handshake (not a cookie), so another site can't open a socket as the user.
// It's checked once per connection; access to each project is checked again on every room join.
const authenticate = async (token: unknown) => {
    if (typeof token !== "string" || token === "") return null;
    try {
        const { sub } = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY, authorizedParties: [appUrl()] });
        const user = await prisma.user.findUnique({ where: { id: sub }, select: { id: true } });
        return user?.id ?? null;
    } catch {
        return null;
    }
};

// Joining runs the same checks as the REST endpoints for that resource
const authorizeJoin = async (room: string, check: () => Promise<unknown>, context: object): Promise<JoinResult> => {
    try {
        await check();
        return { ok: true };
    } catch (err) {
        if (err instanceof AppError) return { ok: false, error: err.message };
        logger.error({ err, ...context }, `${room}:join failed`);
        return { ok: false, error: "Something went wrong" };
    }
};

const joinProject = (userId: string, projectId: unknown): Promise<JoinResult> => {
    const parsed = uuid.safeParse(projectId);
    if (!parsed.success) return Promise.resolve({ ok: false, error: "Invalid project ID" });
    return authorizeJoin("project", () => requireProjectAccess(parsed.data, userId), { userId, projectId });
};

const joinWorkspace = (userId: string, workspaceId: unknown): Promise<JoinResult> => {
    const parsed = clerkId.safeParse(workspaceId);
    if (!parsed.success) return Promise.resolve({ ok: false, error: "Invalid workspace ID" });
    return authorizeJoin("workspace", () => requireWorkspaceMembership(parsed.data, userId), { userId, workspaceId });
};

// With Redis, broadcasts and room changes reach sockets on every API instance; without it, only this one
export const createRealtime = (httpServer: HttpServer, { redisUrl = process.env.REDIS_URL || null }: { redisUrl?: string | null } = {}) => {
    const io: RealtimeServer = new Server(httpServer, {
        cors: { origin: [appUrl()] },
        ...(redisUrl ? { adapter: createRedisAdapter(redisUrl, httpServer) } : {}),
    });

    io.use(async (socket, next) => {
        const userId = await authenticate(socket.handshake.auth?.token);
        if (!userId) return next(new Error("unauthorized"));
        socket.data.userId = userId;
        next();
    });

    io.on("connection", (socket) => {
        const { userId } = socket.data;
        socket.join(userRoom(userId));

        socket.on("project:join", async (projectId, ack) => {
            const result = await joinProject(userId, projectId);
            if (result.ok) await socket.join(projectRoom(projectId as string));
            if (typeof ack === "function") ack(result);
        });

        socket.on("project:leave", async (projectId, ack) => {
            if (typeof projectId === "string") await socket.leave(projectRoom(projectId));
            if (typeof ack === "function") ack();
        });

        socket.on("workspace:join", async (workspaceId, ack) => {
            const result = await joinWorkspace(userId, workspaceId);
            if (result.ok) await socket.join(workspaceRoom(workspaceId as string));
            if (typeof ack === "function") ack(result);
        });

        socket.on("workspace:leave", async (workspaceId, ack) => {
            if (typeof workspaceId === "string") await socket.leave(workspaceRoom(workspaceId));
            if (typeof ack === "function") ack();
        });
    });

    current = io;
    return io;
};

// Call only after the database write has succeeded
export const emitToProject = <E extends keyof ServerToClientEvents>(projectId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>) => {
    current?.to(projectRoom(projectId)).emit(event, ...args);
};

export const emitWorkspaceChanged = (workspaceId: string) => {
    current?.to(workspaceRoom(workspaceId)).emit("workspace:changed", { workspaceId });
};

// Called after a membership change: the user's sockets leave every project room in the workspace they can no longer
// access, and the workspace room itself once they're no longer a member
export const revokeLostProjectAccess = async (userId: string, workspaceId: string) => {
    if (!current) return;
    const membership = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } }, select: { role: true } });
    const [all, allowed] = await Promise.all([
        prisma.project.findMany({ where: { workspaceId }, select: { id: true } }),
        membership ? prisma.project.findMany({ where: accessibleProjects(workspaceId, userId, membership.role), select: { id: true } }) : [],
    ]);
    const allowedIds = new Set(allowed.map((project) => project.id));
    const lost = all.filter((project) => !allowedIds.has(project.id)).map((project) => projectRoom(project.id));
    if (!membership) lost.push(workspaceRoom(workspaceId));
    if (lost.length === 0) return;
    for (const target of everywhere(current, userRoom(userId))) target.socketsLeave(lost);
};

export const disconnectUser = (userId: string) => {
    if (!current) return;
    for (const target of everywhere(current, userRoom(userId))) target.disconnectSockets(true);
};

export const closeWorkspaceRooms = (workspaceId: string, projectIds: string[]) => {
    if (!current) return;
    const rooms = [workspaceRoom(workspaceId), ...projectIds.map(projectRoom)];
    for (const target of everywhere(current, rooms)) target.socketsLeave(rooms);
};

// With the Redis adapter, room changes are applied only when the instance receives its own message back through Redis.
// Revocation mustn't wait for (or depend on) Redis, so apply it here first, then relay it to the other instances.
const everywhere = (io: RealtimeServer, rooms: string | string[]) => [io.local.in(rooms), io.in(rooms)];
