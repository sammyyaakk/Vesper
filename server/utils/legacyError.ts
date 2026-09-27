// Temporary: reproduces the original `error.code || error.message` error responses so the
// TypeScript conversion doesn't change behaviour. Replaced by the central error handler (task 1.3).
export const legacyErrorMessage = (error: unknown) => {
    const { code, message } = error as { code?: string; message?: string };
    return code || message;
};
