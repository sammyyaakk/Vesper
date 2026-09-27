import express from "express";
import { getUserWorkspaces, getWorkspace, getWorkspaceProjects, getWorkspaceSummary } from "../controllers/workspaceController.js";

const workspaceRouter = express.Router();

workspaceRouter.get("/", getUserWorkspaces);
workspaceRouter.get("/:workspaceId", getWorkspace);
workspaceRouter.get("/:workspaceId/projects", getWorkspaceProjects);
workspaceRouter.get("/:workspaceId/summary", getWorkspaceSummary);

export default workspaceRouter;
