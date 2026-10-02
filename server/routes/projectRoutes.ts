import express from "express";
import { addMember, createProject, getProject, getProjectCalendar, getProjectStats, getProjectTasks, setMemberRole, updateProject } from "../controllers/projectController.js";

const projectRouter = express.Router();

projectRouter.post("/", createProject);
projectRouter.put("/", updateProject);
projectRouter.post("/:projectId/addMember", addMember);
projectRouter.put("/:projectId/members/:userId", setMemberRole);
projectRouter.get("/:projectId", getProject);
projectRouter.get("/:projectId/tasks", getProjectTasks);
projectRouter.get("/:projectId/stats", getProjectStats);
projectRouter.get("/:projectId/calendar", getProjectCalendar);

export default projectRouter;
