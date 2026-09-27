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
                create: { userId: newLead, projectId: project.id },
                update: {},
            });
        }

        await tx.user.deleteMany({ where: { id: userId } });
    });
