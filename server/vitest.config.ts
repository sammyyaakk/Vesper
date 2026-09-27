import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/setup/testDatabase.js";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        env: {
            NODE_ENV: "test",
            LOG_LEVEL: "silent",
            DATABASE_URL: TEST_DATABASE_URL,
            DIRECT_URL: TEST_DATABASE_URL,
        },
        globalSetup: ["./tests/setup/globalSetup.ts"],
        setupFiles: ["./tests/setup/testSetup.ts"],
        fileParallelism: false,
    },
});
