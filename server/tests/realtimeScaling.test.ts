import { afterEach, describe, expect, it } from "vitest";
import * as handlers from "../inngest/handlers.js";
import { projectRoom } from "../realtime/index.js";
import { as } from "./helpers/api.js";
import { createTeam } from "./helpers/factories.js";
import { startRealtimeServer, tokenFor } from "./helpers/realtime.js";
import { TEST_REDIS_URL } from "./setup/testDatabase.js";

type RealtimeServer = Awaited<ReturnType<typeof startRealtimeServer>>;
const servers: RealtimeServer[] = [];

const start = async (redisUrl: string | null) => {
    const server = await startRealtimeServer({ redisUrl });
    servers.push(server);
    return server;
};

afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
});

// Instances find each other through Redis pub/sub; wait until both are subscribed
const waitForServers = async (server: RealtimeServer, count: number) => {
    for (let attempt = 0; attempt < 50; attempt++) {
        const connected = await server.io.of("/").adapter.serverCount().catch(() => 0);
        if (connected >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`expected ${count} connected instances`);
};

const due = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

describe("several API instances (Redis adapter)", () => {
    it("delivers an event emitted on one instance to a client connected to another", async () => {
        const { lead, member, project } = await createTeam();
        const b = await start(TEST_REDIS_URL);
        const client = await b.connect({ token: tokenFor(member.id) });
        expect(await client.emitWithAck("project:join", project.id)).toEqual({ ok: true });
        // Created last, so the app's writes emit through instance A
        const a = await start(TEST_REDIS_URL);
        await waitForServers(a, 2);
        const received = new Promise((resolve) => client.once("task:created", resolve));

        await as(lead.id).post("/api/tasks").send({ projectId: project.id, title: "Across instances", dueDate: due() });

        expect(await received).toMatchObject({ title: "Across instances" });
    });

    it("revokes room access on every instance", async () => {
        const { member, workspace, project } = await createTeam();
        const b = await start(TEST_REDIS_URL);
        const client = await b.connect({ token: tokenFor(member.id) });
        await client.emitWithAck("project:join", project.id);
        const a = await start(TEST_REDIS_URL);
        await waitForServers(a, 2);

        await handlers.handleWorkspaceMemberDeletion({
            data: { role: "org:member", organization: { id: workspace.id }, public_user_data: { user_id: member.id } },
        });

        await expect.poll(async () => (await b.io.local.in(projectRoom(project.id)).fetchSockets()).length).toBe(0);
    });

    it("still revokes access on its own instance when Redis is unreachable", async () => {
        const { member, workspace, project } = await createTeam();
        const server = await start("redis://localhost:6399");
        const client = await server.connect({ token: tokenFor(member.id) });
        await client.emitWithAck("project:join", project.id);

        await handlers.handleWorkspaceMemberDeletion({
            data: { role: "org:member", organization: { id: workspace.id }, public_user_data: { user_id: member.id } },
        });

        expect(await server.io.local.in(projectRoom(project.id)).fetchSockets()).toHaveLength(0);
    });

    it("keeps working on one instance when Redis is unreachable", async () => {
        const { lead, member, project } = await createTeam();
        const server = await start("redis://localhost:6399");
        const client = await server.connect({ token: tokenFor(member.id) });
        await client.emitWithAck("project:join", project.id);
        const received = new Promise((resolve) => client.once("task:created", resolve));

        const res = await as(lead.id).post("/api/tasks").send({ projectId: project.id, title: "Local only", dueDate: due() });

        expect(res.status).toBe(200);
        expect(await received).toMatchObject({ title: "Local only" });
    });
});
