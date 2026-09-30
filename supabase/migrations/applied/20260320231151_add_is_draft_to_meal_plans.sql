
-- Add is_draft column to meal_plans table
-- Draft plans are plans in progress that haven't been activated yet
ALTER TABLE meal_plans 
ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient draft lookup (nutritionist querying drafts for a patient)
CREATE INDEX IF NOT EXISTS idx_meal_plans_draft_lookup 
ON meal_plans (patient_id, nutritionist_id, is_draft) 
WHERE is_draft = TRUE;

COMMENT ON COLUMN meal_plans.is_draft IS 'When TRUE, this plan is a work-in-progress rascunho (draft). Drafts are not shown to patients and are not considered active plans. Promoted to is_draft=FALSE when nutritionist clicks "Aplicar Plano".';
