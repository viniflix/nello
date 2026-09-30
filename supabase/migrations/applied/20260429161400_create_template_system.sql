-- 1. Diet Templates
CREATE TABLE IF NOT EXISTS public.diet_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.diet_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own diet templates" ON public.diet_templates FOR ALL USING (auth.uid() = user_id);

-- 2. Diet Template Meals
CREATE TABLE IF NOT EXISTS public.diet_template_meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES public.diet_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    time TIME,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.diet_template_meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own template meals" ON public.diet_template_meals FOR ALL USING (
    EXISTS (SELECT 1 FROM public.diet_templates dt WHERE dt.id = template_id AND dt.user_id = auth.uid())
);

-- 3. Diet Template Foods
CREATE TABLE IF NOT EXISTS public.diet_template_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id UUID REFERENCES public.diet_template_meals(id) ON DELETE CASCADE,
    food_id UUID,
    quantity NUMERIC NOT NULL,
    unit TEXT,
    observation TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.diet_template_foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own template foods" ON public.diet_template_foods FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.diet_template_meals dtm
        JOIN public.diet_templates dt ON dt.id = dtm.template_id
        WHERE dtm.id = meal_id AND dt.user_id = auth.uid()
    )
);

-- 4. Diet Template Food Substitutions
CREATE TABLE IF NOT EXISTS public.diet_template_food_substitutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_food_id UUID REFERENCES public.diet_template_foods(id) ON DELETE CASCADE,
    substitute_food_id UUID,
    quantity NUMERIC,
    unit TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.diet_template_food_substitutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own template substitutions" ON public.diet_template_food_substitutions FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.diet_template_foods dtf
        JOIN public.diet_template_meals dtm ON dtm.id = dtf.meal_id
        JOIN public.diet_templates dt ON dt.id = dtm.template_id
        WHERE dtf.id = template_food_id AND dt.user_id = auth.uid()
    )
);

-- 5. Meal Templates (Independent Meals)
CREATE TABLE IF NOT EXISTS public.meal_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.meal_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own meal templates" ON public.meal_templates FOR ALL USING (auth.uid() = user_id);

-- 6. Meal Template Foods
CREATE TABLE IF NOT EXISTS public.meal_template_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_template_id UUID REFERENCES public.meal_templates(id) ON DELETE CASCADE,
    food_id UUID,
    quantity NUMERIC NOT NULL,
    unit TEXT,
    observation TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.meal_template_foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own meal template foods" ON public.meal_template_foods FOR ALL USING (
    EXISTS (SELECT 1 FROM public.meal_templates mt WHERE mt.id = meal_template_id AND mt.user_id = auth.uid())
);

-- 7. Meal Template Food Substitutions
CREATE TABLE IF NOT EXISTS public.meal_template_food_substitutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_food_id UUID REFERENCES public.meal_template_foods(id) ON DELETE CASCADE,
    substitute_food_id UUID,
    quantity NUMERIC,
    unit TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.meal_template_food_substitutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own meal template substitutions" ON public.meal_template_food_substitutions FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.meal_template_foods mtf
        JOIN public.meal_templates mt ON mt.id = mtf.meal_template_id
        WHERE mtf.id = template_food_id AND mt.user_id = auth.uid()
    )
);

-- 8. Recipes
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    preparation_method TEXT,
    yield_quantity NUMERIC NOT NULL,
    yield_unit TEXT NOT NULL,
    base_calories NUMERIC DEFAULT 0,
    base_protein NUMERIC DEFAULT 0,
    base_carbs NUMERIC DEFAULT 0,
    base_fat NUMERIC DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own recipes" ON public.recipes FOR ALL USING (auth.uid() = user_id);

-- 9. Recipe Ingredients
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    food_id UUID,
    quantity NUMERIC NOT NULL,
    unit TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own recipe ingredients" ON public.recipe_ingredients FOR ALL USING (
    EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_diet_templates_user_id ON public.diet_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_diet_template_meals_template_id ON public.diet_template_meals(template_id);
CREATE INDEX IF NOT EXISTS idx_diet_template_foods_meal_id ON public.diet_template_foods(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_templates_user_id ON public.meal_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON public.recipes(user_id);
