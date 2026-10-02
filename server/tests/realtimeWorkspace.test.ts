import type { Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as handlers from "../inngest/handlers.js";
import { workspaceRoom } from "../realtime/index.js";
import { as } from "./helpers/api.js";
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
const join = (client: ClientSocket, workspaceId: unknown) => client.emitWithAck("workspace:join", workspaceId);
const usersInRoom = async (workspaceId: string) => (await server.io.in(workspaceRoom(workspaceId)).fetchSockets()).map((s) => s.data.userId);

const record = (client: ClientSocket) => {
    const events: { name: string; payload: unknown }[] = [];
    client.onAny((name, payload) => events.push({ name, payload }));
    return events;
};
// One round trip over the socket guarantees earlier server emits have arrived
const settle = (client: ClientSocket) => client.emitWithAck("workspace:leave", "flush");

const due = () => new Date(Date.now() + 3 * 86_400_000).toISOString();
const membership = (workspaceId: string, userId: string, role = "org:member") => ({
    data: { role, organization: { id: workspaceId }, public_user_data: { user_id: userId } },
});

describe("workspace rooms", () => {
    it("lets every workspace member join, including members of no project", async () => {
        const { admin, outsider, workspace } = await createTeam();

        expect(await join(await connectAs(admin.id), workspace.id)).toEqual({ ok: true });
        expect(await join(await connectAs(outsider.id), workspace.id)).toEqual({ ok: true });
        expect((await usersInRoom(workspace.id)).sort()).toEqual([admin.id, outsider.id].sort());
    });

    it("refuses users from other workspaces, unknown workspaces and malformed IDs", async () => {
        const { workspace } = await createTeam();
        const stranger = await createUser();
        const client = await connectAs(stranger.id);

        expect(await join(client, workspace.id)).toEqual({ ok: false, error: expect.stringMatching(/not a member/i) });
        expect(await join(client, "org_does_not_exist")).toEqual({ ok: false, error: "Workspace not found" });
        expect(await join(client, 42)).toEqual({ ok: false, error: "Invalid workspace ID" });
        expect(await usersInRoom(workspace.id)).toEqual([]);
    });
});

describe("workspace:changed", () => {
    it("tells every member when anyone changes the workspace", async () => {
        const { lead, outsider, workspace, project } = await createTeam();
        const watcher = await connectAs(outsider.id);
        await join(watcher, workspace.id);
        const events = record(watcher);

        await as(lead.id).post("/api/tasks").send({ projectId: project.id, title: "Seen everywhere", dueDate: due() });
        await settle(watcher);

        expect(events).toEqual([{ name: "workspace:changed", payload: { workspaceId: workspace.id } }]);
    });

    it("isn't sent to other workspaces", async () => {
        const changed = await createTeam();
        const other = await createTeam();
        const watcher = await connectAs(other.admin.id);
        await join(watcher, other.workspace.id);
        const events = record(watcher);

        await as(changed.lead.id).post("/api/tasks").send({ projectId: changed.project.id, title: "Elsewhere", dueDate: due() });
        await settle(watcher);

        expect(events).toEqual([]);
    });

    it("is sent for Clerk membership changes too", async () => {
        const { admin, workspace } = await createTeam();
        const joiner = await createUser();
        const watcher = await connectAs(admin.id);
        await join(watcher, workspace.id);
        const events = record(watcher);

        await handlers.handleWorkspaceMemberChange(membership(workspace.id, joiner.id));
        await settle(watcher);

        expect(events).toEqual([{ name: "workspace:changed", payload: { workspaceId: workspace.id } }]);
    });
});

describe("losing access removes the socket from the workspace room", () => {
    it("when removed from the workspace", async () => {
        const { admin, member, workspace } = await createTeam();
        await join(await connectAs(member.id), workspace.id);
        await join(await connectAs(admin.id), workspace.id);

        await handlers.handleWorkspaceMemberDeletion(membership(workspace.id, member.id));

        expect(await usersInRoom(workspace.id)).toEqual([admin.id]);
    });

    it("when the workspace is deleted", async () => {
        const { admin, workspace } = await createTeam();
        await join(await connectAs(admin.id), workspace.id);

        await handlers.handleWorkspaceDeletion({ data: { id: workspace.id } });

        expect(await usersInRoom(workspace.id)).toEqual([]);
    });
});
