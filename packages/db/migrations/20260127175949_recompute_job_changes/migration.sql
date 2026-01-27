-- CreateTable
CREATE TABLE "current_visible_prices" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "retailerId" TEXT NOT NULL,
    "merchantId" TEXT,
    "sourceId" TEXT,
    "sourceProductId" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "visiblePrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "url" TEXT NOT NULL,
    "inStock" BOOLEAN NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "shippingCost" DECIMAL(10,2),
    "retailerName" TEXT NOT NULL,
    "retailerTier" "RetailerTier" NOT NULL,
    "ingestionRunType" "IngestionRunType",
    "ingestionRunId" TEXT,
    "recomputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recomputeJobId" TEXT,

    CONSTRAINT "current_visible_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "current_visible_prices_productId_idx" ON "current_visible_prices"("productId");

-- CreateIndex
CREATE INDEX "current_visible_prices_retailerId_idx" ON "current_visible_prices"("retailerId");

-- CreateIndex
CREATE INDEX "current_visible_prices_sourceProductId_idx" ON "current_visible_prices"("sourceProductId");

-- CreateIndex
CREATE INDEX "current_visible_prices_observedAt_idx" ON "current_visible_prices"("observedAt");

-- CreateIndex
CREATE INDEX "current_visible_prices_inStock_idx" ON "current_visible_prices"("inStock");

-- CreateIndex
CREATE INDEX "current_visible_prices_recomputedAt_idx" ON "current_visible_prices"("recomputedAt");
