import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { anonymous } from "./helpers/api.js";

// CVE-2026-42047: Inngest's serve handler returned process.env for PATCH/DELETE/OPTIONS in SDK 3.22.0–3.53.1
const CANARY = "canary-secret-value-7f3a9c";

describe("/api/inngest", () => {
    beforeEach(() => {
        process.env.VESPER_TEST_CANARY = CANARY;
    });

    afterEach(() => {
        delete process.env.VESPER_TEST_CANARY;
    });

    for (const method of ["patch", "delete"] as const) {
        it(`answers ${method.toUpperCase()} with 405 and never leaks environment variables`, async () => {
            const res = await anonymous()[method]("/api/inngest");

            expect(res.status).toBe(405);
            expect(res.headers.allow).toBe("GET, POST, PUT");
            expect(res.text).not.toContain(CANARY);
            expect(res.text).not.toContain("DATABASE_URL");
        });
    }

    it("answers OPTIONS through CORS with an empty body", async () => {
        const res = await anonymous().options("/api/inngest");

        expect(res.status).toBe(204);
        expect(res.text ?? "").toBe("");
    });

    it("still serves the introspection GET without exposing values", async () => {
        const res = await anonymous().get("/api/inngest");

        expect(res.status).toBe(200);
        expect(res.body.function_count).toBe(11);
        expect(res.text).not.toContain(CANARY);
    });
});
