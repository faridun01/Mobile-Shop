-- CreateIndex
CREATE INDEX IF NOT EXISTS "exchange_events_saleId_idx" ON "exchange_events"("saleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exchange_events_date_idx" ON "exchange_events"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_transactions_destinationAccountId_idx" ON "financial_transactions"("destinationAccountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_payments_supplierId_idx" ON "supplier_payments"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_paymentId_idx" ON "supplier_payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_invoiceId_idx" ON "supplier_payment_allocations"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_bonuses_supplierId_idx" ON "supplier_bonuses"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_bonus_devices_bonusId_idx" ON "supplier_bonus_devices"("bonusId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bonus_pool_entries_saleId_idx" ON "bonus_pool_entries"("saleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bonus_pool_entries_deviceId_idx" ON "bonus_pool_entries"("deviceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "repair_tickets_deviceId_idx" ON "repair_tickets"("deviceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "repair_tickets_userId_idx" ON "repair_tickets"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "repair_status_history_ticketId_idx" ON "repair_status_history"("ticketId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_revisions_userId_idx" ON "stock_revisions"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "operation_requests_created_at_idx" ON "operation_requests"("created_at");
