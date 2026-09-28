import { describe, expect, it } from "vitest";
import { anonymous, as } from "./helpers/api.js";
import { createTeam, createUser, createWorkspace } from "./helpers/factories.js";

describe("authentication", () => {
    it("serves the health check without a session", async () => {
        const res = await anonymous().get("/");
        expect(res.status).toBe(200);
    });

    it.each(["/api/workspaces", "/api/tasks/some-task/comments"])("rejects %s without a session", async (url) => {
        const res = await anonymous().get(url);
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: "Unauthorized" });
    });
});

describe("GET /api/workspaces", () => {
    it("returns only the workspaces the user belongs to", async () => {
        const { member, workspace } = await createTeam();
        const stranger = await createUser();
        await createWorkspace(stranger.id);

        const res = await as(member.id).get("/api/workspaces");

        expect(res.status).toBe(200);
        expect(res.body.workspaces.map((w: { id: string }) => w.id)).toEqual([workspace.id]);
    });
});
