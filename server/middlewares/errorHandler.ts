import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/AppError.js";

// Express/body-parser client errors (e.g. malformed JSON) are 4xx with `expose: true`
const isExposedHttpError = (err: unknown): err is { status: number; message: string } =>
    typeof err === "object" &&
    err !== null &&
    "expose" in err &&
    err.expose === true &&
    "status" in err &&
    typeof err.status === "number";

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof AppError) {
        res.status(err.statusCode).json({ message: err.message });
        return;
    }

    if (isExposedHttpError(err)) {
        res.status(err.status).json({ message: err.message });
        return;
    }

    res.err = err;
    res.status(500).json({ message: "Internal server error", requestId: req.id });
};
