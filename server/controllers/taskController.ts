import type { Request, Response } from "express";
import { getUserId } from "../middlewares/authMiddleware.js";
import { AppError } from "../utils/AppError.js";
import prisma from "../configs/prisma.js";
import { inngest } from "../inngest/index.js";

// Create task
export const createTask = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { projectId, title, description, type, status, priority, assigneeId, due_date } = req.body;
    const origin = req.get('origin');

    // Check if user has admin role for project
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { include: { user: true } } },
    });

    if (!project) {
        throw AppError.notFound("Project not found");
    }
    else if (project.team_lead !== userId) {
        throw AppError.forbidden("You don't have admin privileges for this project");
    }
    else if (assigneeId && !project.members.find((member) => member.user.id === assigneeId)) {
        throw AppError.forbidden("assignee is not a member of the project / workspace");
    }

    const task = await prisma.task.create({
        data: {
            projectId,
            title,
            description,
            type,
            priority,
            assigneeId,
            status,
            due_date: new Date(due_date),
        }
    });

    const taskWithAssignee = await prisma.task.findUnique({
        where: { id: task.id },
        include: { assignee: true },
    });

    await inngest.send({
        name: "app/task.assigned",
        data: {
            taskId: task.id, origin
        }
    })

    return res.json({ task: taskWithAssignee, message: "Task created successfully" });
};


// Update task
export const updateTask = async (req: Request<{ id: string }>, res: Response) => {
    const task = await prisma.task.findUnique({
        where: { id: req.params.id },
    });

    if (!task) {
        throw AppError.notFound("Task not found");
    }

    const userId = getUserId(req);

    const project = await prisma.project.findUnique({
        where: { id: task.projectId },
        include: { members: { include: { user: true } } },
    });

    if (!project) {
        throw AppError.notFound("Project not found");
    } else if (project.team_lead !== userId) {
        throw AppError.forbidden("You don't have admin privileges for this project");
    }

    const updatedTask = await prisma.task.update({
        where: { id: req.params.id },
        data: req.body,
    });

    return res.json({ message: "Task updated successfully", task: updatedTask });
};

// Delete task
export const deleteTask = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { tasksIds } = req.body;

    const tasks = await prisma.task.findMany({
        where: { id: { in: tasksIds } },
    });

    if (tasks.length === 0) {
        throw AppError.notFound("Task not found");
    }

    const project = await prisma.project.findUnique({
        // TODO(phase-2) #2
        where: { id: tasks[0]!.projectId },
        include: { members: { include: { user: true } } },
    });

    if (!project) {
        throw AppError.notFound("Project not found");
    } else if (project.team_lead !== userId) {
        throw AppError.forbidden("You don't have admin privileges for this project");
    }

    await prisma.task.deleteMany({
        where: { id: { in: tasksIds } },
    });

    return res.json({ message: "Task deleted successfully" });
};