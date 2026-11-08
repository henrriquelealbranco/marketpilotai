CREATE TABLE "SupplierOutreach" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "supplierId" TEXT,
  "contactEmail" TEXT NOT NULL,
  "contactUrl" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approvalId" TEXT,
  "providerMessageId" TEXT,
  "providerThreadId" TEXT,
  "classification" TEXT,
  "replySummary" TEXT,
  "catalogUrl" TEXT,
  "errorCode" TEXT,
  "sentAt" TIMESTAMP(3),
  "repliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierOutreach_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierOutreach_workspaceId_idempotencyKey_key" ON "SupplierOutreach"("workspaceId", "idempotencyKey");
CREATE INDEX "SupplierOutreach_workspaceId_status_createdAt_idx" ON "SupplierOutreach"("workspaceId", "status", "createdAt");
CREATE INDEX "SupplierOutreach_workspaceId_contactEmail_idx" ON "SupplierOutreach"("workspaceId", "contactEmail");
ALTER TABLE "SupplierOutreach" ADD CONSTRAINT "SupplierOutreach_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
