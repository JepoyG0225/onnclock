ALTER TABLE "expense_claims" ADD COLUMN IF NOT EXISTS "items" JSONB NOT NULL DEFAULT '[]'::jsonb;
