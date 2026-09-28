import { describe, expect, it } from "vitest";
import { assertTestDatabase, assertTestRedis } from "./setup/testDatabase.js";

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

describe("assertTestRedis", () => {
    it.each(["redis://localhost:6379/0", "redis://default:secret@example.upstash.io:6380"])("refuses %s", (url) => {
        expect(() => assertTestRedis(url)).toThrow(/Refusing to flush Redis/);
    });

    it("accepts the local test Redis", () => {
        expect(() => assertTestRedis("redis://localhost:6380/0")).not.toThrow();
    });
});
