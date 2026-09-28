import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./helpers/factories.js";
import { startRealtimeServer, tokenFor } from "./helpers/realtime.js";

let server: Awaited<ReturnType<typeof startRealtimeServer>>;

beforeEach(async () => {
    server = await startRealtimeServer();
});

afterEach(async () => {
    await server.close();
});

describe("socket authentication", () => {
    it("refuses a connection without a token", async () => {
        await expect(server.connect()).rejects.toThrow("unauthorized");
    });

    it("refuses a connection with an invalid token", async () => {
        await expect(server.connect({ token: "forged" })).rejects.toThrow("unauthorized");
    });

    it("refuses a token for a user who isn't in the database", async () => {
        await expect(server.connect({ token: tokenFor("user_unknown") })).rejects.toThrow("unauthorized");
    });

    it("accepts a valid session token and remembers who the socket belongs to", async () => {
        const user = await createUser();

        const client = await server.connect({ token: tokenFor(user.id) });

        expect(client.connected).toBe(true);
        const [socket] = await server.io.fetchSockets();
        expect(socket!.data.userId).toBe(user.id);
    });
});
