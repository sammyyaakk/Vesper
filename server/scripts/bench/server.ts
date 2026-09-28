// Benchmark-only entry point: the real app, with Clerk swapped for fake-clerk.mjs in this process only
import { registerHooks } from "node:module";
import { BENCH_DATABASE_URL, assertBenchDatabase } from "./benchDatabase.js";

const fakeClerkUrl = new URL("./fake-clerk.mjs", import.meta.url).href;

registerHooks({
    resolve: (specifier, context, nextResolve) =>
        specifier === "@clerk/express" ? { url: fakeClerkUrl, shortCircuit: true } : nextResolve(specifier, context),
});

process.env.DATABASE_URL = BENCH_DATABASE_URL;
process.env.DIRECT_URL = BENCH_DATABASE_URL;
process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "warn";
process.env.APP_URL ??= "http://localhost:5173";
// Set by run.ts per scenario; empty turns Redis off (dotenv never overrides a variable that is already set)
process.env.REDIS_URL ??= "";
// Benchmarks measure the endpoints, not the limiter: raise the limits for the single benchmark user
process.env.RATE_LIMIT_READS_PER_MINUTE ??= "10000000";
process.env.RATE_LIMIT_WRITES_PER_MINUTE ??= "10000000";
assertBenchDatabase(process.env.DATABASE_URL);

const { app } = await import("../../app.js");
const port = Number(process.env.BENCH_PORT ?? 5055);
app.listen(port, () => console.log(`bench server listening on ${port}`));
