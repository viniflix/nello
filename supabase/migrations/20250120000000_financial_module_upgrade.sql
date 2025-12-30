-- Migration: Financial Module 2.0 Upgrade
-- Adds status and due_date fields to financial_transactions table

-- Add status column with default 'paid'
ALTER TABLE "public"."financial_transactions" 
ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'paid' CHECK ("status" IN ('paid', 'pending', 'overdue'));

-- Add due_date column (nullable, for pending transactions)
ALTER TABLE "public"."financial_transactions" 
ADD COLUMN IF NOT EXISTS "due_date" date;

-- Update existing records: if transaction_date is in the future, mark as pending
UPDATE "public"."financial_transactions" 
SET "status" = 'pending' 
WHERE "transaction_date" > CURRENT_DATE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS "idx_financial_transactions_status" 
ON "public"."financial_transactions" ("status");

CREATE INDEX IF NOT EXISTS "idx_financial_transactions_due_date" 
ON "public"."financial_transactions" ("due_date");

-- Add comment for documentation
COMMENT ON COLUMN "public"."financial_transactions"."status" IS 'Status do pagamento: paid (pago), pending (pendente), overdue (vencido)';
COMMENT ON COLUMN "public"."financial_transactions"."due_date" IS 'Data de vencimento para transações pendentes';

