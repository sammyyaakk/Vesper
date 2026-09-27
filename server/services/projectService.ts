import prisma from "../configs/prisma.js";
import type { CreateProjectInput, UpdateProjectInput } from "../schemas/project.js";
import { AppError } from "../utils/AppError.js";
import { hasWorkspaceRole, requireProjectLead, requireWorkspace, requireWorkspaceRole } from "./authorization.js";

export const create = async (userId: string, input: CreateProjectInput) => {
    const { workspaceId, description, name, status, startDate, endDate, teamMembers, teamLeadEmail, priority } = input;

    const workspace = await requireWorkspaceRole(
        workspaceId,
        userId,
        "ADMIN",
        AppError.forbidden("You don't have permission to create projects in this workspace"),
    );

    const teamLead = workspace.members.find((member) => member.user.email === teamLeadEmail);
    if (!teamLead) throw AppError.badRequest("Team lead must be a member of this workspace");

    const project = await prisma.project.create({
        data: {
            workspaceId,
            name,
            description,
            status,
            priority,
            teamLead: teamLead.userId,
            startDate: startDate ?? null,
            endDate: endDate ?? null,
        },
    });

    if (teamMembers && teamMembers.length > 0) {
        const membersToAdd = workspace.members
            .filter((member) => teamMembers.includes(member.user.email))
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
    const { id, workspaceId, description, name, status, startDate, endDate, priority } = input;

    // TODO(phase-2) #4
    const workspace = await requireWorkspace(workspaceId);
    if (!hasWorkspaceRole(workspace, userId, "ADMIN")) {
        await requireProjectLead(id, userId, AppError.forbidden("You don't have permission to update projects in this workspace"));
    }

    return prisma.project.update({
        where: { id },
        data: {
            workspaceId,
            description,
            name,
            status,
            priority,
            startDate: startDate ?? null,
            endDate: endDate ?? null,
        },
    });
};

export const addMember = async (userId: string, projectId: string, email: string) => {
    const project = await requireProjectLead(projectId, userId, AppError.notFound("Only project lead can add members"));

    // TODO(phase-2) #5: revisit existing-member check
    const existingMember = project.members.find((member) => (member as { email?: string }).email === email);
    if (existingMember) throw AppError.badRequest("User is already a member");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw AppError.notFound("User not found");

    return prisma.projectMember.create({
        data: { userId: user.id, projectId },
    });
};
