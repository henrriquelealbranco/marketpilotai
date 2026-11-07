-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CatalogSource" AS ENUM ('MANUAL', 'CSV', 'XML');

-- CreateEnum
CREATE TYPE "CatalogFormat" AS ENUM ('CSV', 'XML');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "shippingDays" INTEGER NOT NULL DEFAULT 2,
    "shippingCostCents" INTEGER NOT NULL DEFAULT 0,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Sem categoria',
    "costCents" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "shippingDays" INTEGER NOT NULL DEFAULT 2,
    "shippingCostCents" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT,
    "source" "CatalogSource" NOT NULL DEFAULT 'MANUAL',
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "actorId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "format" "CatalogFormat" NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "shippingDays" INTEGER NOT NULL,
    "shippingCostCents" INTEGER NOT NULL,
    "source" "CatalogSource" NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_workspaceId_status_idx" ON "Supplier"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_id_workspaceId_key" ON "Supplier"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "Product_workspaceId_status_updatedAt_idx" ON "Product"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_workspaceId_supplierId_sku_key" ON "Product"("workspaceId", "supplierId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_workspaceId_key" ON "Product"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "CatalogImport_workspaceId_createdAt_idx" ON "CatalogImport"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogImport_workspaceId_supplierId_fileHash_key" ON "CatalogImport"("workspaceId", "supplierId", "fileHash");

-- CreateIndex
CREATE INDEX "CostSnapshot_workspaceId_productId_createdAt_idx" ON "CostSnapshot"("workspaceId", "productId", "createdAt");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_workspaceId_fkey" FOREIGN KEY ("supplierId", "workspaceId") REFERENCES "Supplier"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImport" ADD CONSTRAINT "CatalogImport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImport" ADD CONSTRAINT "CatalogImport_supplierId_workspaceId_fkey" FOREIGN KEY ("supplierId", "workspaceId") REFERENCES "Supplier"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImport" ADD CONSTRAINT "CatalogImport_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSnapshot" ADD CONSTRAINT "CostSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSnapshot" ADD CONSTRAINT "CostSnapshot_productId_workspaceId_fkey" FOREIGN KEY ("productId", "workspaceId") REFERENCES "Product"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
