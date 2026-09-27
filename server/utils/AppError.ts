export class AppError extends Error {
    constructor(readonly statusCode: number, message: string) {
        super(message);
        this.name = "AppError";
    }

    static badRequest(message: string) {
        return new AppError(400, message);
    }

    static unauthorized(message = "Unauthorized") {
        return new AppError(401, message);
    }

    static forbidden(message: string) {
        return new AppError(403, message);
    }

    static notFound(message: string) {
        return new AppError(404, message);
    }

    static conflict(message: string) {
        return new AppError(409, message);
    }
}
