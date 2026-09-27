import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { legacyErrorMessage } from "../utils/legacyError.js";

export const protect = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const { userId } = getAuth(req);

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        return next();
    } catch (error) {
        console.log(error);
        res.status(401).json({ message: legacyErrorMessage(error) });
    }
};

// For handlers behind `protect`: the signed-in user's ID, typed as a definite string
export const getUserId = (req: Request): string => {
    const { userId } = getAuth(req);
    if (!userId) throw new Error("getUserId called on an unauthenticated request");
    return userId;
};
