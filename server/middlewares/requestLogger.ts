import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../configs/logger.js";

const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

export const requestLogger = pinoHttp({
    logger,
    genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
    },
    customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
    },
    serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
    },
    // Inngest dev server re-registers functions every few seconds
    autoLogging: { ignore: (req) => req.method === "PUT" && req.url === "/api/inngest" },
});
