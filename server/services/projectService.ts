import type { Priority, ProjectStatus } from "@prisma/client";
import prisma from "../configs/prisma.js";
import { AppError } from "../utils/AppError.js";

interface ProjectFields {
    workspaceId: string;
    name: string;
    description?: string;
    status?: ProjectStatus;
    priority?: Priority;
    progress?: number;
    start_date?: string;
    end_date?: string;
}

export interface CreateProjectInput extends ProjectFields {
    team_lead: string;
    team_members?: string[];
}

export interface UpdateProjectInput extends ProjectFields {
    id: string;
}

const findWorkspaceWithMembers = (workspaceId: string) =>
    prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { members: { include: { user: true } } },
    });

const toDate = (value?: string) => (value ? new Date(value) : null);

export const create = async (userId: string, input: CreateProjectInput) => {
    const { workspaceId, description, name, status, start_date, end_date, team_members, team_lead, progress, priority } = input;

    const workspace = await findWorkspaceWithMembers(workspaceId);
    if (!workspace) throw AppError.notFound("Workspace not found");

    if (!workspace.members.some((member) => member.userId === userId && member.role === "ADMIN")) {
        throw AppError.forbidden("You don't have permission to create projects in this workspace");
    }

    const teamLead = await prisma.user.findUnique({
        where: { email: team_lead },
        select: { id: true },
    });

    const project = await prisma.project.create({
        data: {
            workspaceId,
            name,
            description,
            status,
            priority,
            progress,
            // TODO(phase-2) #6: validate team_lead
            team_lead: teamLead?.id as string,
            start_date: toDate(start_date),
            end_date: toDate(end_date),
        },
    });

    if (team_members && team_members.length > 0) {
        const membersToAdd = workspace.members
            .filter((member) => team_members.includes(member.user.email))
            .map((member) => member.user.id);

        await prisma.projectMember.createMany({
            data: membersToAdd.map((memberId) => ({ projectId: project.id, userId: memberId })),
        });
    }

    return prisma.project.findUnique({
        where: { id: project.id },
        include: {
            members: { include: { user: true } },
            tasks: { include: { assignee: true, comments: { include: { user: true } } } },
            owner: true,
        },
    });
};

export const update = async (userId: string, input: UpdateProjectInput) => {
    const { id, workspaceId, description, name, status, start_date, end_date, progress, priority } = input;

    const workspace = await findWorkspaceWithMembers(workspaceId);
    if (!workspace) throw AppError.notFound("Workspace not found");

    if (!workspace.members.some((member) => member.userId === userId && member.role === "ADMIN")) {
        const project = await prisma.project.findUnique({ where: { id } });
        if (!project) throw AppError.notFound("Project not found");
        if (project.team_lead !== userId) {
            throw AppError.forbidden("You don't have permission to update projects in this workspace");
        }
    }

    return prisma.project.update({
        where: { id },
        data: {
            workspaceId,
            description,
            name,
            status,
            priority,
            progress,
            start_date: toDate(start_date),
            end_date: toDate(end_date),
        },
    });
};

export const addMember = async (userId: string, projectId: string, email: string) => {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { include: { user: true } } },
    });
    if (!project) throw AppError.notFound("Project not found");

    if (project.team_lead !== userId) throw AppError.notFound("Only project lead can add members");

    // TODO(phase-2) #5: revisit existing-member check
    const existingMember = project.members.find((member) => (member as { email?: string }).email === email);
    if (existingMember) throw AppError.badRequest("User is already a member");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw AppError.notFound("User not found");

    return prisma.projectMember.create({
        data: { userId: user.id, projectId },
    });
};
