import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const connectionString = process.env.DATABASE_URL ?? "";
const isNeon = connectionString.includes(".neon.tech");

const createClient = () => {
    if (!isNeon) return new PrismaClient();
    neonConfig.webSocketConstructor = ws;
    neonConfig.poolQueryViaFetch = true;
    return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
};

// Reuse the client across dev hot reloads
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV === "development") globalForPrisma.prisma = prisma;

export default prisma;
