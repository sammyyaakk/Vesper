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

// Behind a load balancer, trust that many proxy hops for the client IP (rate limiting, logs); never trust X-Forwarded-For otherwise
const proxyHops = Number(process.env.TRUST_PROXY);
if (proxyHops > 0) app.set("trust proxy", proxyHops);

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

// Only the methods Inngest uses reach its handler (GET introspection, PUT sync, POST runs); SDKs up to 3.53.1 leaked
// process.env on other methods (CVE-2026-42047), so this stays as defense in depth
const inngestHandler = serve({ client: inngest, functions });
app.route("/api/inngest")
    .get(inngestHandler)
    .post(inngestHandler)
    .put(inngestHandler)
    .all((_req, res) => {
        res.set("Allow", "GET, POST, PUT").status(405).json({ message: "Method not allowed" });
    });

app.use("/api/workspaces", protect, ...rateLimits, workspaceRouter);
app.use("/api/projects", protect, ...rateLimits, projectRouter);
app.use("/api/tasks", protect, ...rateLimits, taskRouter);
app.use("/api/comments", protect, ...rateLimits, commentRouter);

app.use(errorHandler);
