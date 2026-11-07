CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');
CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'ADMIN',
  "workspaceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
