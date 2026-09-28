import type { Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as } from "./helpers/api.js";
import { createProject, createTask, createTeam } from "./helpers/factories.js";
import { startRealtimeServer, tokenFor } from "./helpers/realtime.js";

let server: Awaited<ReturnType<typeof startRealtimeServer>>;

beforeEach(async () => {
    server = await startRealtimeServer();
});

afterEach(async () => {
    await server.close();
});

const inRoom = async (userId: string, projectId: string) => {
    const client = await server.connect({ token: tokenFor(userId) });
    const result = await client.emitWithAck("project:join", projectId);
    expect(result).toEqual({ ok: true });
    return client;
};

// Collects every event a socket receives, so tests can assert on what did and didn't arrive
const record = (client: ClientSocket) => {
    const events: { name: string; payload: any }[] = [];
    client.onAny((name, payload) => events.push({ name, payload }));
    return events;
};

// Events are emitted before the HTTP response; one round trip over the socket guarantees they've been delivered
const settle = (client: ClientSocket) => client.emitWithAck("project:leave", "flush");

const due = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

describe("real-time events", () => {
    it("sends a created task to everyone in the project's room", async () => {
        const { lead, member, project } = await createTeam();
        const watcher = await inRoom(member.id, project.id);
        const events = record(watcher);

        const res = await as(lead.id).post("/api/tasks").send({ projectId: project.id, title: "Live", assigneeId: member.id, dueDate: due() });
        await settle(watcher);

        expect(events).toEqual([
            { name: "task:created", payload: expect.objectContaining({ id: res.body.task.id, title: "Live", projectId: project.id, assignee: expect.objectContaining({ id: member.id }) }) },
        ]);
    });

    it("sends updates and deletions", async () => {
        const { lead, member, project } = await createTeam();
        const [first, second] = [await createTask(project.id), await createTask(project.id)];
        const watcher = await inRoom(member.id, project.id);
        const events = record(watcher);

        await as(lead.id).put(`/api/tasks/${first!.id}`).send({ status: "DONE" });
        await as(lead.id).post("/api/tasks/delete").send({ tasksIds: [first!.id, second!.id] });
        await settle(watcher);

        expect(events.map((e) => e.name)).toEqual(["task:updated", "tasks:deleted"]);
        expect(events[0]!.payload).toMatchObject({ id: first!.id, status: "DONE" });
        expect(events[1]!.payload).toEqual({ projectId: project.id, taskIds: expect.arrayContaining([first!.id, second!.id]) });
    });

    it("sends new comments with their author", async () => {
        const { lead, member, project } = await createTeam();
        const task = await createTask(project.id);
        const watcher = await inRoom(member.id, project.id);
        const events = record(watcher);

        await as(lead.id).post("/api/comments").send({ taskId: task.id, content: "On it" });
        await settle(watcher);

        expect(events).toEqual([
            { name: "comment:created", payload: expect.objectContaining({ taskId: task.id, content: "On it", user: expect.objectContaining({ id: lead.id }) }) },
        ]);
    });

    it("doesn't send a project's events to other projects' rooms", async () => {
        const { admin, lead, outsider, workspace, project } = await createTeam();
        const otherProject = await createProject(workspace.id, admin.id, [outsider.id]);
        const watcher = await inRoom(outsider.id, otherProject.id);
        const events = record(watcher);

        await as(lead.id).post("/api/tasks").send({ projectId: project.id, title: "Private", dueDate: due() });
        await settle(watcher);

        expect(events).toEqual([]);
    });

    it("sends nothing when the write is refused", async () => {
        const { lead, member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: lead.id });
        const watcher = await inRoom(lead.id, project.id);
        const events = record(watcher);

        const res = await as(member.id).put(`/api/tasks/${task.id}`).send({ title: "Not yours" });
        await settle(watcher);

        expect(res.status).toBe(403);
        expect(events).toEqual([]);
    });
});
