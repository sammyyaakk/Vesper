import type { Server as HttpServer } from "node:http";
import { verifyToken } from "@clerk/express";
import { Server } from "socket.io";
import { appUrl } from "../configs/appUrl.js";
import { logger } from "../configs/logger.js";
import prisma from "../configs/prisma.js";

export interface SocketData {
    userId: string;
}

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

export const createRealtime = (httpServer: HttpServer) => {
    const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(httpServer, {
        cors: { origin: [appUrl()] },
    });

    io.use(async (socket, next) => {
        const userId = await authenticate(socket.handshake.auth?.token);
        if (!userId) return next(new Error("unauthorized"));
        socket.data.userId = userId;
        next();
    });

    io.on("connection", (socket) => {
        logger.debug({ userId: socket.data.userId, socketId: socket.id }, "socket connected");
    });

    return io;
};
