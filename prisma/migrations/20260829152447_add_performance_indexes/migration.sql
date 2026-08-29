-- CreateIndex
CREATE INDEX "audit_logs_targetId_idx" ON "audit_logs"("targetId");

-- CreateIndex
CREATE INDEX "devices_createdAt_idx" ON "devices"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_targetUserId_createdAt_idx" ON "notifications"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_targetRole_createdAt_idx" ON "notifications"("targetRole", "createdAt");

-- CreateIndex
CREATE INDEX "repair_tickets_storeId_createdAt_idx" ON "repair_tickets"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_createdAt_idx" ON "sales"("createdAt");
