import type { Prisma } from "@prisma/client";
import prisma from "../configs/prisma.js";

type Tx = Prisma.TransactionClient;

const pickSuccessor = async (tx: Tx, workspaceId: string, leavingUserId: string) => {
    const others = await tx.workspaceMember.findMany({
        where: { workspaceId, userId: { not: leavingUserId } },
        orderBy: [{ role: "asc" }, { userId: "asc" }],
    });
    return others.find((member) => member.role === "ADMIN") ?? others[0];
};

// Keeps the team's data when someone leaves: ownership and project leadership move to a remaining admin (DR-051)
export const removeUser = (userId: string) =>
    prisma.$transaction(async (tx) => {
        const ownedWorkspaces = await tx.workspace.findMany({ where: { ownerId: userId }, select: { id: true } });
        for (const { id: workspaceId } of ownedWorkspaces) {
            const successor = await pickSuccessor(tx, workspaceId, userId);
            if (!successor) continue;
            await tx.workspaceMember.update({ where: { id: successor.id }, data: { role: "ADMIN" } });
            await tx.workspace.update({ where: { id: workspaceId }, data: { ownerId: successor.userId } });
        }

        const ledProjects = await tx.project.findMany({
            where: { teamLead: userId },
            select: { id: true, workspace: { select: { ownerId: true } } },
        });
        for (const project of ledProjects) {
            const newLead = project.workspace.ownerId;
            if (newLead === userId) continue;
            await tx.project.update({ where: { id: project.id }, data: { teamLead: newLead } });
            await tx.projectMember.upsert({
                where: { userId_projectId: { userId: newLead, projectId: project.id } },
                create: { userId: newLead, projectId: project.id, role: "LEAD" },
                update: { role: "LEAD" },
            });
        }

        await tx.user.deleteMany({ where: { id: userId } });
    });

// Someone removed from one workspace: the same hand-over as removeUser, limited to that workspace, plus their assignments there
export const removeFromWorkspace = (workspaceId: string, userId: string) =>
    prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
        if (!workspace) return;

        let ownerId = workspace.ownerId;
        if (ownerId === userId) {
            const successor = await pickSuccessor(tx, workspaceId, userId);
            if (successor) {
                await tx.workspaceMember.update({ where: { id: successor.id }, data: { role: "ADMIN" } });
                await tx.workspace.update({ where: { id: workspaceId }, data: { ownerId: successor.userId } });
                ownerId = successor.userId;
            }
        }

        if (ownerId !== userId) {
            const ledProjects = await tx.project.findMany({ where: { workspaceId, teamLead: userId }, select: { id: true } });
            for (const { id: projectId } of ledProjects) {
                await tx.project.update({ where: { id: projectId }, data: { teamLead: ownerId } });
                await tx.projectMember.upsert({
                    where: { userId_projectId: { userId: ownerId, projectId } },
                    create: { userId: ownerId, projectId, role: "LEAD" },
                    update: { role: "LEAD" },
                });
            }
        }

        const inWorkspace = { project: { workspaceId } };
        await tx.projectMember.deleteMany({ where: { userId, ...inWorkspace } });
        await tx.task.updateMany({ where: { assigneeId: userId, ...inWorkspace }, data: { assigneeId: null } });
        await tx.workspaceMember.deleteMany({ where: { userId, workspaceId } });
    });
