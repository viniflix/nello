CREATE OR REPLACE FUNCTION public.clone_diet_template_to_patient(
    p_template_id UUID,
    p_patient_id UUID,
    p_nutritionist_id UUID,
    p_name TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_template public.diet_templates%ROWTYPE;
    v_new_plan_id BIGINT;
    v_meal public.diet_template_meals%ROWTYPE;
    v_new_meal_id BIGINT;
    v_food public.diet_template_foods%ROWTYPE;
    v_new_food_id BIGINT;
    v_sub public.diet_template_food_substitutions%ROWTYPE;
BEGIN
    -- Check permissions
    SELECT * INTO v_template FROM public.diet_templates WHERE id = p_template_id AND user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found or access denied';
    END IF;

    -- Create Meal Plan
    INSERT INTO public.meal_plans (
        patient_id,
        nutritionist_id,
        name,
        description,
        is_active,
        is_draft,
        start_date
    ) VALUES (
        p_patient_id,
        p_nutritionist_id,
        COALESCE(p_name, v_template.name),
        v_template.description,
        true,
        true, -- Defaults to draft so nutritionist can edit before activating
        CURRENT_DATE
    ) RETURNING id INTO v_new_plan_id;

    -- Clone Meals
    FOR v_meal IN SELECT * FROM public.diet_template_meals WHERE template_id = p_template_id ORDER BY order_index ASC LOOP
        INSERT INTO public.meal_plan_meals (
            meal_plan_id,
            name,
            meal_type,
            meal_time,
            order_index
        ) VALUES (
            v_new_plan_id,
            v_meal.name,
            'other', -- Default or map if available
            v_meal.time,
            v_meal.order_index
        ) RETURNING id INTO v_new_meal_id;

        -- Clone Foods
        FOR v_food IN SELECT * FROM public.diet_template_foods WHERE meal_id = v_meal.id ORDER BY order_index ASC LOOP
            INSERT INTO public.meal_plan_foods (
                meal_plan_meal_id,
                food_id,
                quantity,
                unit,
                notes,
                order_index,
                calories, protein, carbs, fat -- Defaults as 0 for recalculation in frontend
            ) VALUES (
                v_new_meal_id,
                v_food.food_id,
                v_food.quantity,
                v_food.unit,
                v_food.observation,
                v_food.order_index,
                0, 0, 0, 0
            ) RETURNING id INTO v_new_food_id;

            -- Clone Substitutions
            FOR v_sub IN SELECT * FROM public.diet_template_food_substitutions WHERE template_food_id = v_food.id LOOP
                INSERT INTO public.meal_plan_food_substitutions (
                    meal_plan_food_id,
                    substitute_food_id,
                    quantity,
                    unit
                ) VALUES (
                    v_new_food_id,
                    v_sub.substitute_food_id,
                    v_sub.quantity,
                    v_sub.unit
                );
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN v_new_plan_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.clone_meal_template_to_plan(
    p_meal_template_id UUID,
    p_meal_plan_id BIGINT,
    p_meal_type TEXT,
    p_meal_time TIME DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_template public.meal_templates%ROWTYPE;
    v_new_meal_id BIGINT;
    v_food public.meal_template_foods%ROWTYPE;
    v_new_food_id BIGINT;
    v_sub public.meal_template_food_substitutions%ROWTYPE;
BEGIN
    -- Check permissions
    SELECT * INTO v_template FROM public.meal_templates WHERE id = p_meal_template_id AND user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found or access denied';
    END IF;

    -- Create Meal in Plan
    INSERT INTO public.meal_plan_meals (
        meal_plan_id,
        name,
        meal_type,
        meal_time,
        order_index
    ) VALUES (
        p_meal_plan_id,
        v_template.name,
        p_meal_type::public.meal_type_enum,
        p_meal_time,
        (SELECT COALESCE(MAX(order_index) + 1, 0) FROM public.meal_plan_meals WHERE meal_plan_id = p_meal_plan_id)
    ) RETURNING id INTO v_new_meal_id;

    -- Clone Foods
    FOR v_food IN SELECT * FROM public.meal_template_foods WHERE meal_template_id = p_meal_template_id ORDER BY order_index ASC LOOP
        INSERT INTO public.meal_plan_foods (
            meal_plan_meal_id,
            food_id,
            quantity,
            unit,
            notes,
            order_index,
            calories, protein, carbs, fat -- Defaults as 0
        ) VALUES (
            v_new_meal_id,
            v_food.food_id,
            v_food.quantity,
            v_food.unit,
            v_food.observation,
            v_food.order_index,
            0, 0, 0, 0
        ) RETURNING id INTO v_new_food_id;

        -- Clone Substitutions
        FOR v_sub IN SELECT * FROM public.meal_template_food_substitutions WHERE template_food_id = v_food.id LOOP
            INSERT INTO public.meal_plan_food_substitutions (
                meal_plan_food_id,
                substitute_food_id,
                quantity,
                unit
            ) VALUES (
                v_new_food_id,
                v_sub.substitute_food_id,
                v_sub.quantity,
                v_sub.unit
            );
        END LOOP;
    END LOOP;

    RETURN v_new_meal_id;
END;
$$;
