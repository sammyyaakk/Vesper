export const TEST_DATABASE_URL = "postgresql://vesper:vesper@localhost:5433/vesper_test";
export const TEST_REDIS_URL = "redis://localhost:6380/0";

export const assertTestDatabase = (url = process.env.DATABASE_URL ?? "") => {
    const { hostname, pathname } = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(hostname) || !pathname.endsWith("_test")) {
        throw new Error(`Refusing to run tests against ${hostname}${pathname}: tests only run on a local *_test database`);
    }
};

export const assertTestRedis = (url = process.env.REDIS_URL ?? "") => {
    const { hostname, port } = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(hostname) || port !== "6380") {
        throw new Error(`Refusing to flush Redis at ${hostname}:${port}: tests only use the local test Redis on port 6380`);
    }
};
