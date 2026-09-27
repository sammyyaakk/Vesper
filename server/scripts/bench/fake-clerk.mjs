// Stand-in for @clerk/express, loaded only by the benchmark server (see server.ts in this folder)
export const clerkMiddleware = () => (_req, _res, next) => next();

export const getAuth = (req) => ({ userId: req.header("x-bench-user-id") ?? null });
