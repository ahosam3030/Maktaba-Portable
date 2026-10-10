-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'معدات',
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cost" DECIMAL NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "serialNumber" TEXT,
    "location" TEXT,
    "supplierName" TEXT,
    "notes" TEXT,
    "postedToCash" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Asset_organizationId_status_idx" ON "Asset"("organizationId", "status");
CREATE INDEX "Asset_organizationId_category_idx" ON "Asset"("organizationId", "category");
CREATE INDEX "Asset_organizationId_purchaseDate_idx" ON "Asset"("organizationId", "purchaseDate");
