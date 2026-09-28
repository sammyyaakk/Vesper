export const BENCH_DATABASE_URL = "postgresql://vesper:vesper@localhost:5434/vesper_bench";

// Database 1 of the dev Redis, so benchmarks never touch dev keys (database 0)
export const BENCH_REDIS_URL = "redis://localhost:6379/1";

export const assertBenchRedis = (url: string) => {
    const { hostname, port, pathname } = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(hostname) || port !== "6379" || pathname !== "/1") {
        throw new Error(`Refusing to flush Redis at ${url}: only the local benchmark database (6379/1) is allowed`);
    }
};

export const BENCH_USER_HEADER = "x-bench-user-id";

export const assertBenchDatabase = (url: string) => {
    const { hostname, pathname } = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(hostname) || !pathname.endsWith("_bench")) {
        throw new Error(`Refusing to run benchmarks against ${hostname}${pathname}: only a local *_bench database is allowed`);
    }
};
