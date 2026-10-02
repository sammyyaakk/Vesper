import { Inngest } from "inngest";
import { logger } from "../configs/logger.js";
import * as handlers from "./handlers.js";

export const inngest = new Inngest({ id: "vesper", logger });

const syncUserCreation = inngest.createFunction({ id: "sync-user-from-clerk" }, { event: "clerk/user.created" }, ({ event }) => handlers.handleUserCreation(event));

const syncUserDeletion = inngest.createFunction({ id: "delete-user-with-clerk" }, { event: "clerk/user.deleted" }, ({ event }) => handlers.handleUserDeletion(event));

const syncUserUpdation = inngest.createFunction({ id: "update-user-from-clerk" }, { event: "clerk/user.updated" }, ({ event }) => handlers.handleUserUpdation(event));

const syncWorkspaceCreation = inngest.createFunction({ id: "sync-workspace-from-clerk" }, { event: "clerk/organization.created" }, ({ event }) => handlers.handleWorkspaceCreation(event));

const syncWorkspaceUpdation = inngest.createFunction({ id: "update-workspace-from-clerk" }, { event: "clerk/organization.updated" }, ({ event }) => handlers.handleWorkspaceUpdation(event));

const syncWorkspaceDeletion = inngest.createFunction({ id: "delete-workspace-with-clerk" }, { event: "clerk/organization.deleted" }, ({ event }) => handlers.handleWorkspaceDeletion(event));

const syncWorkspaceMemberChange = inngest.createFunction(
    { id: "sync-workspace-member-change-from-clerk" },
    [{ event: "clerk/organizationMembership.created" }, { event: "clerk/organizationMembership.updated" }],
    ({ event }) => handlers.handleWorkspaceMemberChange(event),
);

const syncWorkspaceMemberDeletion = inngest.createFunction({ id: "remove-workspace-member-with-clerk" }, { event: "clerk/organizationMembership.deleted" }, ({ event }) => handlers.handleWorkspaceMemberDeletion(event));

const sendTaskAssignmentEmail = inngest.createFunction({ id: "send-task-assignment-mail" }, { event: "app/task.assigned" }, ({ event, step }) => handlers.handleTaskAssigned(event, step));

const sendTaskDueReminder = inngest.createFunction(
    {
        id: "send-task-due-reminder",
        cancelOn: [
            { event: "app/task.due-date.set", match: "data.taskId" },
            { event: "app/task.deleted", match: "data.taskId" },
        ],
    },
    { event: "app/task.due-date.set" },
    ({ event, step }) => handlers.handleTaskReminder(event, step),
);

export const functions = [syncUserCreation, syncUserDeletion, syncUserUpdation, syncWorkspaceCreation, syncWorkspaceUpdation, syncWorkspaceDeletion, syncWorkspaceMemberChange, syncWorkspaceMemberDeletion, sendTaskAssignmentEmail, sendTaskDueReminder];
