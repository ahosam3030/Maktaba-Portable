CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Customer_organizationId_name_key" ON "Customer"("organizationId", "name");
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");

CREATE TABLE "CustomerPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "saleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CustomerPayment_organizationId_customerId_date_idx" ON "CustomerPayment"("organizationId", "customerId", "date");
CREATE INDEX "CustomerPayment_customerId_idx" ON "CustomerPayment"("customerId");

ALTER TABLE "Sale" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'PAID';
CREATE INDEX "Sale_organizationId_customerId_idx" ON "Sale"("organizationId", "customerId");
CREATE INDEX "Sale_organizationId_paymentStatus_idx" ON "Sale"("organizationId", "paymentStatus");
