-- CreateTable
CREATE TABLE "PricingQuote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'rules',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "actorId" TEXT NOT NULL,
    "productId" TEXT,
    "inputJson" JSONB NOT NULL,
    "outputJson" JSONB,
    "model" TEXT,
    "responseId" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMicrosUsd" INTEGER,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT,
    "recommendation" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "score" INTEGER,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reason" TEXT,
    "resultJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOrder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "amountCents" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "costsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Sem categoria',
    "supplierName" TEXT NOT NULL DEFAULT 'Não vinculado',
    "buyerAlias" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "linesJson" JSONB NOT NULL,
    "tracking" TEXT,
    "deadline" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketObservation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "itemId" TEXT,
    "title" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL_AUTHORIZED',
    "attributesJson" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationEvent" (
    "id" SERIAL NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detailJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'internal',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "resultJson" JSONB,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "externalExecutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "metadataJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "verifierEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingQuote_workspaceId_productId_createdAt_idx" ON "PricingQuote"("workspaceId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_workspaceId_createdAt_idx" ON "AgentRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_id_workspaceId_key" ON "AgentRun"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "AgentDecision_workspaceId_createdAt_idx" ON "AgentDecision"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Approval_workspaceId_status_createdAt_idx" ON "Approval"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_workspaceId_status_idx" ON "Listing"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_workspaceId_externalId_key" ON "Listing"("workspaceId", "externalId");

-- CreateIndex
CREATE INDEX "MarketplaceOrder_workspaceId_orderedAt_idx" ON "MarketplaceOrder"("workspaceId", "orderedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOrder_workspaceId_externalId_key" ON "MarketplaceOrder"("workspaceId", "externalId");

-- CreateIndex
CREATE INDEX "MarketObservation_workspaceId_productId_observedAt_idx" ON "MarketObservation"("workspaceId", "productId", "observedAt");

-- CreateIndex
CREATE INDEX "OperationEvent_workspaceId_id_idx" ON "OperationEvent"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Alert_workspaceId_status_idx" ON "Alert"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_workspaceId_key_key" ON "Alert"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationConfig_workspaceId_workflowKey_key" ON "AutomationConfig"("workspaceId", "workflowKey");

-- CreateIndex
CREATE INDEX "WorkflowExecution_workspaceId_createdAt_idx" ON "WorkflowExecution"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowExecution_workspaceId_idempotencyKey_key" ON "WorkflowExecution"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_workspaceId_provider_key" ON "IntegrationConnection"("workspaceId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_stateHash_key" ON "OAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "OAuthState_workspaceId_expiresAt_idx" ON "OAuthState"("workspaceId", "expiresAt");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_actorId_createdAt_idx" ON "Conversation"("workspaceId", "actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "PricingQuote" ADD CONSTRAINT "PricingQuote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingQuote" ADD CONSTRAINT "PricingQuote_productId_workspaceId_fkey" FOREIGN KEY ("productId", "workspaceId") REFERENCES "Product"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDecision" ADD CONSTRAINT "AgentDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDecision" ADD CONSTRAINT "AgentDecision_runId_workspaceId_fkey" FOREIGN KEY ("runId", "workspaceId") REFERENCES "AgentRun"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_productId_workspaceId_fkey" FOREIGN KEY ("productId", "workspaceId") REFERENCES "Product"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationEvent" ADD CONSTRAINT "OperationEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationConfig" ADD CONSTRAINT "AutomationConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
