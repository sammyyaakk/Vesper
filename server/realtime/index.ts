import type { Server as HttpServer } from "node:http";
import { verifyToken } from "@clerk/express";
import { Server } from "socket.io";
import { appUrl } from "../configs/appUrl.js";
import { logger } from "../configs/logger.js";
import prisma from "../configs/prisma.js";
import { uuid } from "../schemas/common.js";
import { accessibleProjects, requireProjectAccess } from "../services/authorization.js";
import { AppError } from "../utils/AppError.js";

type JoinResult = { ok: true } | { ok: false; error: string };

interface ClientToServerEvents {
    "project:join": (projectId: unknown, ack: (result: JoinResult) => void) => void;
    "project:leave": (projectId: unknown, ack: () => void) => void;
}

export interface SocketData {
    userId: string;
}

type RealtimeServer = Server<ClientToServerEvents, Record<string, never>, Record<string, never>, SocketData>;

export const projectRoom = (projectId: string) => `project:${projectId}`;
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

const joinProject = async (userId: string, projectId: unknown): Promise<JoinResult> => {
    const parsed = uuid.safeParse(projectId);
    if (!parsed.success) return { ok: false, error: "Invalid project ID" };
    try {
        await requireProjectAccess(parsed.data, userId);
        return { ok: true };
    } catch (err) {
        if (err instanceof AppError) return { ok: false, error: err.message };
        logger.error({ err, userId, projectId }, "project:join failed");
        return { ok: false, error: "Something went wrong" };
    }
};

export const createRealtime = (httpServer: HttpServer) => {
    const io: RealtimeServer = new Server(httpServer, { cors: { origin: [appUrl()] } });

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
    });

    current = io;
    return io;
};

// Called after a membership change: the user's sockets leave every project room in the workspace they can no longer access
export const revokeLostProjectAccess = async (userId: string, workspaceId: string) => {
    if (!current) return;
    const membership = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } }, select: { role: true } });
    const [all, allowed] = await Promise.all([
        prisma.project.findMany({ where: { workspaceId }, select: { id: true } }),
        membership ? prisma.project.findMany({ where: accessibleProjects(workspaceId, userId, membership.role), select: { id: true } }) : [],
    ]);
    const allowedIds = new Set(allowed.map((project) => project.id));
    const lost = all.filter((project) => !allowedIds.has(project.id)).map((project) => projectRoom(project.id));
    if (lost.length > 0) current.in(userRoom(userId)).socketsLeave(lost);
};

export const disconnectUser = (userId: string) => {
    current?.in(userRoom(userId)).disconnectSockets(true);
};

export const closeProjectRooms = (projectIds: string[]) => {
    if (!current || projectIds.length === 0) return;
    const rooms = projectIds.map(projectRoom);
    current.in(rooms).socketsLeave(rooms);
};
