-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('LEAD', 'CONTRIBUTOR', 'VIEWER');

-- AlterTable: existing members become contributors
ALTER TABLE "ProjectMember" ADD COLUMN     "role" "ProjectRole" NOT NULL DEFAULT 'CONTRIBUTOR';

-- Each project's named lead gets the LEAD role (adding the membership row if it's missing)
INSERT INTO "ProjectMember" ("id", "userId", "projectId", "role")
SELECT gen_random_uuid()::text, p."team_lead", p."id", 'LEAD'
FROM "Project" p
ON CONFLICT ("userId", "projectId") DO UPDATE SET "role" = 'LEAD';
