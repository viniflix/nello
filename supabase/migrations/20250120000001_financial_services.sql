-- Migration: Financial Services Catalog
-- Creates services table for standardizing prices

CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric NOT NULL,
    "category" "text" DEFAULT 'consulta'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "services_category_check" CHECK (("category" IN ('consulta', 'plano_mensal', 'outros')))
);

ALTER TABLE "public"."services" OWNER TO "postgres";

ALTER TABLE "public"."services" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."services_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Add foreign key constraint
ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_services_nutritionist_id" 
ON "public"."services" ("nutritionist_id");

CREATE INDEX IF NOT EXISTS "idx_services_is_active" 
ON "public"."services" ("is_active");

-- Add comments
COMMENT ON TABLE "public"."services" IS 'Catálogo de serviços padronizados do nutricionista';
COMMENT ON COLUMN "public"."services"."price" IS 'Preço padrão do serviço em R$';
COMMENT ON COLUMN "public"."services"."category" IS 'Categoria do serviço: consulta, plano_mensal, outros';

-- Enable RLS
ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for services
-- Nutritionists can view their own services
CREATE POLICY "Nutritionists can view their own services"
ON "public"."services"
FOR SELECT
USING (nutritionist_id = auth.uid());

-- Nutritionists can insert their own services
CREATE POLICY "Nutritionists can insert their own services"
ON "public"."services"
FOR INSERT
WITH CHECK (nutritionist_id = auth.uid());

-- Nutritionists can update their own services
CREATE POLICY "Nutritionists can update their own services"
ON "public"."services"
FOR UPDATE
USING (nutritionist_id = auth.uid())
WITH CHECK (nutritionist_id = auth.uid());

-- Nutritionists can delete their own services (soft delete via update)
CREATE POLICY "Nutritionists can delete their own services"
ON "public"."services"
FOR DELETE
USING (nutritionist_id = auth.uid());

