import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { serve } from "inngest/express";
import { appUrl } from "./configs/appUrl.js";
import { inngest, functions } from "./inngest/index.js";
import { protect } from "./middlewares/authMiddleware.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { rateLimit } from "./middlewares/rateLimit.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import workspaceRouter from "./routes/workspaceRoutes.js";
import projectRouter from "./routes/projectRoutes.js";
import taskRouter from "./routes/taskRoutes.js";
import commentRouter from "./routes/commentRoutes.js";

export const app = express();

const perMinute = (variable: string, fallback: number) => Number(process.env[variable]) || fallback;
const isRead = (method: string) => method === "GET" || method === "HEAD";
const rateLimits = [
    rateLimit({ name: "reads", limit: perMinute("RATE_LIMIT_READS_PER_MINUTE", 300), windowSeconds: 60, skip: (req) => !isRead(req.method) }),
    rateLimit({ name: "writes", limit: perMinute("RATE_LIMIT_WRITES_PER_MINUTE", 60), windowSeconds: 60, skip: (req) => isRead(req.method) }),
];

app.use(requestLogger);
app.use(express.json());
app.use(cors({ origin: [appUrl()] }));
app.use(clerkMiddleware());

app.get("/", (req, res) => res.send("Server is live!"));

app.use("/api/inngest", serve({ client: inngest, functions }));

app.use("/api/workspaces", protect, ...rateLimits, workspaceRouter);
app.use("/api/projects", protect, ...rateLimits, projectRouter);
app.use("/api/tasks", protect, ...rateLimits, taskRouter);
app.use("/api/comments", protect, ...rateLimits, commentRouter);

app.use(errorHandler);
