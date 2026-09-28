import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { app } from "../../app.js";
import { createRealtime } from "../../realtime/index.js";

// The test Clerk double accepts "test:<userId>" as a valid session token
export const tokenFor = (userId: string) => `test:${userId}`;

export const startRealtimeServer = async (options: Parameters<typeof createRealtime>[1] = {}) => {
    const httpServer = createServer(app);
    const io = createRealtime(httpServer, options);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    const clients: ClientSocket[] = [];

    const connect = (auth: Record<string, unknown> = {}) => {
        const socket = connectClient(url, { auth, transports: ["websocket"], forceNew: true, reconnection: false });
        clients.push(socket);
        return new Promise<ClientSocket>((resolve, reject) => {
            socket.once("connect", () => resolve(socket));
            socket.once("connect_error", reject);
        });
    };

    const close = async () => {
        for (const client of clients) client.disconnect();
        await io.close();
    };

    return { io, url, connect, close };
};
