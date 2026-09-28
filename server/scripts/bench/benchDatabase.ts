export const BENCH_DATABASE_URL = "postgresql://vesper:vesper@localhost:5434/vesper_bench";

export const BENCH_USER_HEADER = "x-bench-user-id";

export const assertBenchDatabase = (url: string) => {
    const { hostname, pathname } = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(hostname) || !pathname.endsWith("_bench")) {
        throw new Error(`Refusing to run benchmarks against ${hostname}${pathname}: only a local *_bench database is allowed`);
    }
};
