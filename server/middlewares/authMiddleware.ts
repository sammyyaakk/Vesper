import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { AppError } from "../utils/AppError.js";

export const protect = (req: Request, _res: Response, next: NextFunction) => {
    if (!getAuth(req).userId) throw AppError.unauthorized();
    next();
};

export const getUserId = (req: Request): string => {
    const { userId } = getAuth(req);
    if (!userId) throw new Error("getUserId called on an unauthenticated request");
    return userId;
};
