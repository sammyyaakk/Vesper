import { execSync } from "node:child_process";
import { TEST_DATABASE_URL, assertTestDatabase } from "./testDatabase.js";

export default function setup() {
    assertTestDatabase(TEST_DATABASE_URL);
    execSync("npx prisma migrate deploy", {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL },
    });
}
