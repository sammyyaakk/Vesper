import type { GetStepTools } from "inngest";
import type { WorkspaceRole } from "@prisma/client";
import prisma from "../configs/prisma.js";
import sendEmail from "../configs/nodemailer.js";
import { assignmentEmail, reminderEmail } from "../emails/taskEmails.js";
import { removeUser } from "../services/userService.js";
import { invalidateWorkspace } from "../services/workspaceCache.js";
import type { inngest } from "./index.js";

export type Step = Pick<GetStepTools<typeof inngest>, "run" | "sleepUntil">;
// Clerk and app event payloads aren't typed yet (DR-013)
type EventData = any;

interface ClerkUserData {
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: { email_address: string }[];
}

const displayName = ({ first_name, last_name, email_addresses }: ClerkUserData) =>
    [first_name, last_name].filter(Boolean).join(" ") || email_addresses?.[0]?.email_address.split("@")[0] || "User";

// Names and avatars show up in every workspace the user belongs to
const workspaceIdsOf = async (userId: string) =>
    (await prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true } })).map((m) => m.workspaceId);

// Custom Clerk roles get the least privilege
const toWorkspaceRole = (clerkRole?: string): WorkspaceRole => (clerkRole === "org:admin" ? "ADMIN" : "MEMBER");

// Clerk delivers webhooks at least once, so every sync handler must be safe to replay
export const handleUserCreation = async (event: { data?: EventData }) => {
    const { data } = event;
    const fields = {
        email: data?.email_addresses[0]?.email_address,
        name: displayName(data),
        image: data?.image_url ?? "",
    };
    await prisma.user.upsert({ where: { id: data.id }, create: { id: data.id, ...fields }, update: fields });
    await invalidateWorkspace(...(await workspaceIdsOf(data.id)));
};

export const handleUserDeletion = async (event: { data?: EventData }) => {
    const workspaceIds = await workspaceIdsOf(event.data.id);
    await removeUser(event.data.id);
    await invalidateWorkspace(...workspaceIds);
};

export const handleUserUpdation = async (event: { data?: EventData }) => {
    const { data } = event;
    await prisma.user.update({
        where: {
            id: data.id,
        },
        data: {
            email: data?.email_addresses[0]?.email_address,
            name: displayName(data),
            image: data?.image_url,
        },
    });
    await invalidateWorkspace(...(await workspaceIdsOf(data.id)));
};

export const handleWorkspaceCreation = async (event: { data?: EventData }) => {
    const { data } = event;
    const fields = { name: data.name, slug: data.slug, imageUrl: data.image_url ?? "" };
    await prisma.workspace.upsert({
        where: { id: data.id },
        create: { id: data.id, ownerId: data.created_by, ...fields },
        update: fields,
    });
    await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: data.created_by, workspaceId: data.id } },
        create: { userId: data.created_by, workspaceId: data.id, role: "ADMIN" },
        update: { role: "ADMIN" },
    });
    await invalidateWorkspace(data.id);
};

export const handleWorkspaceUpdation = async (event: { data?: EventData }) => {
    const { data } = event;
    await prisma.workspace.update({
        where: {
            id: data.id,
        },
        data: {
            name: data.name,
            slug: data.slug,
            imageUrl: data.image_url,
        },
    });
    await invalidateWorkspace(data.id);
};

export const handleWorkspaceDeletion = async (event: { data?: EventData }) => {
    const { data } = event;
    await prisma.workspace.delete({
        where: {
            id: data.id,
        },
    });
    await invalidateWorkspace(data.id);
};

export const handleWorkspaceMemberCreation = async (event: { data?: EventData }) => {
    const { data } = event;
    const role = toWorkspaceRole(data.role);
    await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: data.user_id, workspaceId: data.organization_id } },
        create: { userId: data.user_id, workspaceId: data.organization_id, role },
        update: { role },
    });
    await invalidateWorkspace(data.organization_id);
};

const loadTaskForEmail = (taskId: string) =>
    prisma.task.findUnique({
        where: { id: taskId },
        include: { assignee: true, project: { include: { owner: true } } },
    });

type TaskForEmail = NonNullable<Awaited<ReturnType<typeof loadTaskForEmail>>>;

const emailInput = (task: TaskForEmail, recipientName: string) => ({
    recipientName,
    projectName: task.project.name,
    projectId: task.projectId,
    taskId: task.id,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
});

// app/task.assigned { taskId, assigneeId }
export const handleTaskAssigned = async (event: { data?: EventData }, step: Step) => {
    const { taskId, assigneeId } = event.data ?? {};

    await step.run("send-assignment-email", async () => {
        const task = await loadTaskForEmail(taskId);
        if (!task?.assignee) return "skipped: task deleted or unassigned";
        if (assigneeId && task.assigneeId !== assigneeId) return "skipped: reassigned since";

        await sendEmail({ to: task.assignee.email, ...assignmentEmail(emailInput(task, task.assignee.name)) });
        return "sent";
    });
};

// app/task.due-date.set { taskId, dueDate }: cancelled by a newer due date or deletion (see index.ts)
export const handleTaskReminder = async (event: { data?: EventData }, step: Step) => {
    const { taskId, dueDate } = event.data ?? {};

    await step.sleepUntil("wait-until-due", new Date(dueDate));

    await step.run("send-reminder-email", async () => {
        const task = await loadTaskForEmail(taskId);
        if (!task) return "skipped: task deleted";
        if (task.status === "DONE") return "skipped: done";
        if (task.dueDate.getTime() !== new Date(dueDate).getTime()) return "skipped: due date changed";

        const recipient = task.assignee ?? task.project.owner;
        await sendEmail({ to: recipient.email, ...reminderEmail(emailInput(task, recipient.name)) });
        return "sent";
    });
};
