import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL, TEST_REDIS_URL } from "./tests/setup/testDatabase.js";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        env: {
            NODE_ENV: "test",
            LOG_LEVEL: "silent",
            APP_URL: "http://localhost:5173",
            REDIS_URL: TEST_REDIS_URL,
            DATABASE_URL: TEST_DATABASE_URL,
            DIRECT_URL: TEST_DATABASE_URL,
        },
        globalSetup: ["./tests/setup/globalSetup.ts"],
        setupFiles: ["./tests/setup/testSetup.ts"],
        fileParallelism: false,
    },
});
