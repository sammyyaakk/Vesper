import express from "express";
import { createTask, deleteTask, getTask, getTaskCommentsPage, updateTask } from "../controllers/taskController.js";

const taskRouter = express.Router();

taskRouter.post("/", createTask);
taskRouter.put("/:id", updateTask);
taskRouter.post("/delete", deleteTask);
taskRouter.get("/:id", getTask);
taskRouter.get("/:id/comments", getTaskCommentsPage);

export default taskRouter;
