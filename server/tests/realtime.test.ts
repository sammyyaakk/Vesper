import { randomUUID } from "node:crypto";
import type { Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as handlers from "../inngest/handlers.js";
import { projectRoom } from "../realtime/index.js";
import { createTeam, createUser } from "./helpers/factories.js";
import { startRealtimeServer, tokenFor } from "./helpers/realtime.js";

let server: Awaited<ReturnType<typeof startRealtimeServer>>;

beforeEach(async () => {
    server = await startRealtimeServer();
});

afterEach(async () => {
    await server.close();
});

const connectAs = (userId: string) => server.connect({ token: tokenFor(userId) });

const join = (client: ClientSocket, projectId: unknown) => client.emitWithAck("project:join", projectId);

const usersInRoom = async (projectId: string) => (await server.io.in(projectRoom(projectId)).fetchSockets()).map((s) => s.data.userId);

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

        const client = await connectAs(user.id);

        expect(client.connected).toBe(true);
        const [socket] = await server.io.fetchSockets();
        expect(socket!.data.userId).toBe(user.id);
    });
});

describe("project rooms", () => {
    it("lets the lead, project members and workspace admins join", async () => {
        const { admin, lead, member, project } = await createTeam();

        for (const user of [admin, lead, member]) {
            expect(await join(await connectAs(user.id), project.id)).toEqual({ ok: true });
        }

        expect((await usersInRoom(project.id)).sort()).toEqual([admin.id, lead.id, member.id].sort());
    });

    it("refuses a workspace member who isn't on the project", async () => {
        const { outsider, project } = await createTeam();

        const result = await join(await connectAs(outsider.id), project.id);

        expect(result).toEqual({ ok: false, error: expect.stringMatching(/not member/i) });
        expect(await usersInRoom(project.id)).toEqual([]);
    });

    it("refuses an admin of another workspace", async () => {
        const { project } = await createTeam();
        const other = await createTeam();

        expect((await join(await connectAs(other.admin.id), project.id)).ok).toBe(false);
        expect(await usersInRoom(project.id)).toEqual([]);
    });

    it("refuses unknown and malformed project IDs", async () => {
        const { member } = await createTeam();
        const client = await connectAs(member.id);

        expect(await join(client, randomUUID())).toEqual({ ok: false, error: "Project not found" });
        expect(await join(client, "not-an-id")).toEqual({ ok: false, error: "Invalid project ID" });
    });

    it("leaves a room on request", async () => {
        const { member, project } = await createTeam();
        const client = await connectAs(member.id);
        await join(client, project.id);

        await client.emitWithAck("project:leave", project.id);

        expect(await usersInRoom(project.id)).toEqual([]);
    });
});

describe("losing access removes the socket from rooms", () => {
    const membership = (workspaceId: string, userId: string, role = "org:member") => ({
        data: { role, organization: { id: workspaceId }, public_user_data: { user_id: userId } },
    });

    it("when removed from the workspace", async () => {
        const { member, lead, workspace, project } = await createTeam();
        const client = await connectAs(member.id);
        await join(client, project.id);
        await join(await connectAs(lead.id), project.id);

        await handlers.handleWorkspaceMemberDeletion(membership(workspace.id, member.id));

        expect(await usersInRoom(project.id)).toEqual([lead.id]);
        expect(client.connected).toBe(true);
    });

    it("when an admin is demoted and isn't on the project", async () => {
        const { admin, workspace, project } = await createTeam();
        await join(await connectAs(admin.id), project.id);

        await handlers.handleWorkspaceMemberChange(membership(workspace.id, admin.id, "org:member"));

        expect(await usersInRoom(project.id)).toEqual([]);
    });

    it("when the user is deleted: all their sockets are disconnected", async () => {
        const { member, project } = await createTeam();
        const client = await connectAs(member.id);
        await join(client, project.id);
        const disconnected = new Promise((resolve) => client.once("disconnect", resolve));

        await handlers.handleUserDeletion({ data: { id: member.id } });

        await disconnected;
        expect(await usersInRoom(project.id)).toEqual([]);
    });

    it("when the workspace is deleted", async () => {
        const { lead, workspace, project } = await createTeam();
        await join(await connectAs(lead.id), project.id);

        await handlers.handleWorkspaceDeletion({ data: { id: workspace.id } });

        expect(await usersInRoom(project.id)).toEqual([]);
    });
});
