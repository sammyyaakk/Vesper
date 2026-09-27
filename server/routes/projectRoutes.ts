import express from "express";
import { addMember, createProject, getProject, getProjectTasks, updateProject } from "../controllers/projectController.js";

const projectRouter = express.Router();

projectRouter.post("/", createProject);
projectRouter.put("/", updateProject);
projectRouter.post("/:projectId/addMember", addMember);
projectRouter.get("/:projectId", getProject);
projectRouter.get("/:projectId/tasks", getProjectTasks);

export default projectRouter;
