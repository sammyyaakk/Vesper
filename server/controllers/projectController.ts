import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { AppError } from "../utils/AppError.js";
import prisma from "../configs/prisma.js";

// Create project
export const createProject = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { workspaceId, description, name, status, start_date, end_date, team_members, team_lead, progress, priority } = req.body;

    //check if user has admin role for workspace
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { members: { include: { user: true } } },
    });

    if (!workspace) {
        throw AppError.notFound("Workspace not found");
    }

    if (!workspace.members.some((member) => member.userId === userId && member.role === "ADMIN")) {
        throw AppError.forbidden("You don't have permission to create projects in this workspace");
    }

    // Get Team Lead using email
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
            start_date: start_date ? new Date(start_date) : null,
            end_date: end_date ? new Date(end_date) : null,
        }
    });

    // Add members to project if they are in the workspace
    if (team_members?.length > 0) {
        const membersToAdd: string[] = []
        workspace.members.forEach(member => {
            if (team_members.includes(member.user.email)) {
                membersToAdd.push(member.user.id)
            }
        })

        await prisma.projectMember.createMany({
            data: membersToAdd.map(memberId => ({
                projectId: project.id,
                userId: memberId,
            }))
        })
    }

    const projectWithMembers = await prisma.project.findUnique({
        where: { id: project.id },
        include: {
            members: { include: { user: true } },
            tasks: { include: { assignee: true, comments: { include: { user: true } } } },
            owner: true
        }
    });

    return res.json({ project: projectWithMembers, message: "Project created successfully" });

};

// Update project
export const updateProject = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { id, workspaceId, description, name, status, start_date, end_date, progress, priority } = req.body;

    // check if user has admin role for workspace
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { members: { include: { user: true } } },
    });

    if (!workspace) {
        throw AppError.notFound("Workspace not found");
    }

    // check if user has admin role for project
    if (!workspace.members.some((member) => member.userId === userId && member.role === "ADMIN")) {

        const project = await prisma.project.findUnique({
            where: { id }
        });

        if (!project) {
            throw AppError.notFound("Project not found");
        } else if (project.team_lead !== userId) {
            throw AppError.forbidden("You don't have permission to update projects in this workspace");
        }
    }

    const project = await prisma.project.update({
        where: { id },
        data: {
            workspaceId,
            description,
            name,
            status,
            priority,
            progress,
            start_date: start_date ? new Date(start_date) : null,
            end_date: end_date ? new Date(end_date) : null,
        }
    });
    
    return res.json({ project, message: "Project updated successfully" });
};


// Add Member to Project
export const addMember = async (req: Request<{ projectId: string }>, res: Response) => {
    const userId = getUserId(req);
    const { projectId } = req.params;
    const { email } = req.body;

    // Check if user is project lead
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { include: { user: true } } },
    });

            if (!project ) {
        throw AppError.notFound("Project not found");
    }

    if (project.team_lead !== userId) {
        throw AppError.notFound("Only project lead can add members");
    }

    // Check if user is already a member
    // TODO(phase-2) #5: revisit existing-member check
    const existingMember = project.members.find((member) => (member as { email?: string }).email === email);

    if (existingMember) {
        throw AppError.badRequest("User is already a member");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        throw AppError.notFound("User not found");
    }

    const member = await prisma.projectMember.create({
        data: {
            userId: user.id,
            projectId,
        },
    });

    return res.json({ member, message: "Member added successfully" });
};