import { describe, expect, it } from "vitest";
import { assertTestDatabase } from "./setup/testDatabase.js";

describe("assertTestDatabase", () => {
    it.each([
        "postgresql://user:pass@ep-example-123.ap-southeast-1.aws.neon.tech/neondb",
        "postgresql://vesper:vesper@localhost:5433/vesper",
        "postgresql://vesper:vesper@db.example.com:5432/vesper_test",
    ])("refuses %s", (url) => {
        expect(() => assertTestDatabase(url)).toThrow(/Refusing to run tests/);
    });

    it("accepts a local *_test database", () => {
        expect(() => assertTestDatabase("postgresql://vesper:vesper@localhost:5433/vesper_test")).not.toThrow();
    });
});
