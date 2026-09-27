import request from "supertest";
import { app } from "../../app.js";

export const TEST_USER_HEADER = "x-test-user-id";

export const anonymous = () => request(app);

export const as = (userId: string) => ({
    get: (url: string) => request(app).get(url).set(TEST_USER_HEADER, userId),
    post: (url: string) => request(app).post(url).set(TEST_USER_HEADER, userId),
    put: (url: string) => request(app).put(url).set(TEST_USER_HEADER, userId),
});
