// Prisma client singleton.
//
// Prisma 7 removed the datasource URL from schema.prisma, so the connection is
// supplied two ways: `prisma.config.ts` for CLI commands (migrate, db push,
// studio) and the driver adapter below for the running app. The globalThis
// cache keeps dev-server hot reloads from opening a new pool on every recompile.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
