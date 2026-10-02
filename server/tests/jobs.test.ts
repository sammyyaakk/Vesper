import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../configs/prisma.js";
import sendEmail from "../configs/nodemailer.js";
import * as handlers from "../inngest/handlers.js";
import type { Step } from "../inngest/handlers.js";
import { as } from "./helpers/api.js";
import { createTask, createTeam, createUser, createWorkspace } from "./helpers/factories.js";
import { inngestSend } from "./setup/testSetup.js";

const sentEmails = () => vi.mocked(sendEmail).mock.calls.map(([email]) => email);

// Mimics Inngest: completed steps are memoized across replays, nested steps are an error, sleeps return immediately
const createStep = () => {
    const memo = new Map<string, unknown>();
    const sleeps: { id: string; until: Date }[] = [];
    let depth = 0;
    const step = {
        run: async (id: string, fn: () => unknown) => {
            if (depth > 0) throw new Error(`Nested step "${id}"`);
            if (memo.has(id)) return memo.get(id);
            depth++;
            try {
                const result = await fn();
                memo.set(id, result);
                return result;
            } finally {
                depth--;
            }
        },
        sleepUntil: async (id: string, until: Date | string) => {
            sleeps.push({ id, until: new Date(until) });
        },
    };
    return { step: step as unknown as Step, sleeps };
};

const sentEvents = () => inngestSend.mock.calls.flatMap(([payload]) => (Array.isArray(payload) ? payload : [payload]));

beforeEach(() => {
    vi.mocked(sendEmail).mockClear();
});

describe("task assignment email", () => {
    it("#8: escapes user-controlled text in the email HTML", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id, {
            assigneeId: member.id,
            title: "<img src=x onerror=alert(1)>",
            description: "<script>steal()</script>",
        });

        await handlers.handleTaskAssigned({ data: { taskId: task.id, assigneeId: member.id } }, createStep().step);

        const [email] = sentEmails();
        expect(email?.body).not.toContain("<img src=x");
        expect(email?.body).not.toContain("<script>");
        expect(email?.body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    });

    it("#8: builds the link from APP_URL, never from the request's Origin", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: member.id });

        await handlers.handleTaskAssigned(
            { data: { taskId: task.id, assigneeId: member.id, origin: "https://evil.example" } },
            createStep().step,
        );

        const [email] = sentEmails();
        expect(email?.body).not.toContain("evil.example");
        expect(email?.body).toContain(`http://localhost:5173/taskDetails?projectId=${project.id}&amp;taskId=${task.id}`);
    });

    it("#16: sends the email once even when Inngest replays the function", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: member.id });
        const { step } = createStep();
        const event = { data: { taskId: task.id, assigneeId: member.id } };

        await handlers.handleTaskAssigned(event, step);
        await handlers.handleTaskAssigned(event, step);

        expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("#17: never nests steps", async () => {
        const { member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: member.id, dueDate: new Date(Date.now() + 86_400_000) });
        await expect(handlers.handleTaskAssigned({ data: { taskId: task.id, assigneeId: member.id } }, createStep().step)).resolves.not.toThrow();
    });

    it("#19: does nothing (and doesn't crash) if the task was deleted", async () => {
        await expect(
            handlers.handleTaskAssigned({ data: { taskId: "00000000-0000-4000-8000-000000000000" } }, createStep().step),
        ).resolves.not.toThrow();
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("skips the email if the task was reassigned before it ran", async () => {
        const { lead, member, project } = await createTeam();
        const task = await createTask(project.id, { assigneeId: lead.id });

        await handlers.handleTaskAssigned({ data: { taskId: task.id, assigneeId: member.id } }, createStep().step);

        expect(sendEmail).not.toHaveBeenCalled();
    });
});

describe("due-date reminder", () => {
    const reminderEvent = (taskId: string, dueDate: Date) => ({ data: { taskId, dueDate: dueDate.toISOString() } });

    it("sleeps until the due date, then reminds the assignee", async () => {
        const { member, project } = await createTeam();
        const dueDate = new Date(Date.now() + 3 * 86_400_000);
        const task = await createTask(project.id, { assigneeId: member.id, dueDate });
        const { step, sleeps } = createStep();

        await handlers.handleTaskReminder(reminderEvent(task.id, dueDate), step);

        expect(sleeps.map((s) => s.until.getTime())).toEqual([dueDate.getTime()]);
        expect(sentEmails().map((e) => e?.to)).toEqual([member.email]);
    });

    it("reminds the project lead when the task is unassigned", async () => {
        const { lead, project } = await createTeam();
        const dueDate = new Date(Date.now() + 86_400_000);
        const task = await createTask(project.id, { dueDate });

        await handlers.handleTaskReminder(reminderEvent(task.id, dueDate), createStep().step);

        expect(sentEmails().map((e) => e?.to)).toEqual([lead.email]);
    });

    it("doesn't remind for a finished task", async () => {
        const { member, project } = await createTeam();
        const dueDate = new Date(Date.now() + 86_400_000);
        const task = await createTask(project.id, { assigneeId: member.id, dueDate, status: "DONE" });

        await handlers.handleTaskReminder(reminderEvent(task.id, dueDate), createStep().step);

        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("#9: ignores a reminder scheduled for a due date that has since changed", async () => {
        const { member, project } = await createTeam();
        const oldDueDate = new Date(Date.now() + 86_400_000);
        const task = await createTask(project.id, { assigneeId: member.id, dueDate: new Date(Date.now() + 5 * 86_400_000) });

        await handlers.handleTaskReminder(reminderEvent(task.id, oldDueDate), createStep().step);

        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("doesn't crash if the task was deleted", async () => {
        await expect(
            handlers.handleTaskReminder(reminderEvent("00000000-0000-4000-8000-000000000000", new Date()), createStep().step),
        ).resolves.not.toThrow();
    });
});

describe("events emitted by the API", () => {
    const inAWeek = () => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

    it("schedules a reminder when a task is created", async () => {
        const { lead, project } = await createTeam();
        const res = await as(lead.id).post("/api/tasks").send({ projectId: project.id, title: "T", dueDate: inAWeek() });

        expect(sentEvents()).toEqual(
            expect.arrayContaining([expect.objectContaining({ name: "app/task.due-date.set", data: expect.objectContaining({ taskId: res.body.task.id }) })]),
        );
    });

    it("#9: reschedules the reminder when the due date changes", async () => {
        const { lead, project } = await createTeam();
        const task = await createTask(project.id);
        const newDueDate = inAWeek();

        await as(lead.id).put(`/api/tasks/${task.id}`).send({ dueDate: newDueDate });

        expect(sentEvents()).toEqual([
            expect.objectContaining({ name: "app/task.due-date.set", data: { taskId: task.id, dueDate: new Date(newDueDate).toISOString() } }),
        ]);
    });

    it("notifies someone assigned by a manager, but not a member claiming a task", async () => {
        const { lead, member, project } = await createTeam();
        const assignedByLead = await createTask(project.id);
        const claimed = await createTask(project.id);

        await as(lead.id).put(`/api/tasks/${assignedByLead.id}`).send({ assigneeId: member.id });
        await as(member.id).put(`/api/tasks/${claimed.id}`).send({ assigneeId: member.id });

        expect(sentEvents()).toEqual([
            expect.objectContaining({ name: "app/task.assigned", data: { taskId: assignedByLead.id, assigneeId: member.id } }),
        ]);
    });

    it("cancels reminders when tasks are deleted", async () => {
        const { lead, project } = await createTeam();
        const task = await createTask(project.id);

        await as(lead.id).post("/api/tasks/delete").send({ tasksIds: [task.id] });

        expect(sentEvents()).toEqual([expect.objectContaining({ name: "app/task.deleted", data: { taskId: task.id } })]);
    });
});

describe("Clerk sync", () => {
    it("#18: maps Clerk roles explicitly; unknown/custom roles become MEMBER", async () => {
        const owner = await createUser();
        const workspace = await createWorkspace(owner.id);
        const admin = await createUser();
        const billing = await createUser();

        await handlers.handleWorkspaceMemberChange({
            data: { role: "org:admin", organization: { id: workspace.id }, public_user_data: { user_id: admin.id } },
        });
        await handlers.handleWorkspaceMemberChange({
            data: { role: "org:billing_manager", organization: { id: workspace.id }, public_user_data: { user_id: billing.id } },
        });

        const roles = await prisma.workspaceMember.findMany({ where: { userId: { in: [admin.id, billing.id] } }, select: { userId: true, role: true } });
        expect(Object.fromEntries(roles.map((r) => [r.userId, r.role]))).toEqual({ [admin.id]: "ADMIN", [billing.id]: "MEMBER" });
    });

    it("handles replayed webhooks idempotently (Clerk delivers at least once)", async () => {
        const userEvent = { data: { id: "user_replay", first_name: "Re", last_name: "Play", email_addresses: [{ email_address: "replay@test.dev" }], image_url: "" } };
        const orgEvent = { data: { id: "org_replay", name: "Replay Org", slug: "replay-org", created_by: "user_replay", image_url: "" } };

        for (let i = 0; i < 2; i++) {
            await handlers.handleUserCreation(userEvent);
            await handlers.handleWorkspaceCreation(orgEvent);
        }

        expect(await prisma.user.count({ where: { id: "user_replay" } })).toBe(1);
        expect(await prisma.workspaceMember.count({ where: { workspaceId: "org_replay" } })).toBe(1);
    });
});

describe("event publishing is best-effort", () => {
    it("still creates the task when Inngest is unreachable", async () => {
        const { lead, project } = await createTeam();
        inngestSend.mockRejectedValueOnce(new Error("Inngest down"));

        const res = await as(lead.id)
            .post("/api/tasks")
            .send({ projectId: project.id, title: "Saved anyway", dueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) });

        expect(res.status).toBe(200);
        expect(await prisma.task.count()).toBe(1);
    });
});
