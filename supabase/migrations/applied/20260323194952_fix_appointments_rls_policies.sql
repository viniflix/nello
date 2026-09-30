-- Fix RLS policies for appointments table to include user_profiles.nutritionist_id linkage

-- 1. INSERT policy
DROP POLICY IF EXISTS appointments_insert ON appointments;
CREATE POLICY appointments_insert ON appointments
FOR INSERT
TO authenticated
WITH CHECK (
    nutritionist_id = auth.uid()
    AND (
        patient_id IS NULL
        OR EXISTS (
            SELECT 1 FROM nutritionist_patients np
            WHERE np.patient_id = appointments.patient_id
            AND np.nutritionist_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = appointments.patient_id
            AND up.nutritionist_id = auth.uid()
        )
    )
);

-- 2. SELECT policy
DROP POLICY IF EXISTS appointments_select ON appointments;
CREATE POLICY appointments_select ON appointments
FOR SELECT
TO authenticated
USING (
    (
        nutritionist_id = auth.uid()
        AND (
            patient_id IS NULL
            OR EXISTS (
                SELECT 1 FROM nutritionist_patients np
                WHERE np.patient_id = appointments.patient_id
                AND np.nutritionist_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM user_profiles up
                WHERE up.id = appointments.patient_id
                AND up.nutritionist_id = auth.uid()
            )
        )
    )
    OR (patient_id = auth.uid())
);

-- 3. UPDATE policy
DROP POLICY IF EXISTS appointments_update ON appointments;
CREATE POLICY appointments_update ON appointments
FOR UPDATE
TO authenticated
USING (
    nutritionist_id = auth.uid()
    AND (
        patient_id IS NULL
        OR EXISTS (
            SELECT 1 FROM nutritionist_patients np
            WHERE np.patient_id = appointments.patient_id
            AND np.nutritionist_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = appointments.patient_id
            AND up.nutritionist_id = auth.uid()
        )
    )
)
WITH CHECK (
    nutritionist_id = auth.uid()
    AND (
        patient_id IS NULL
        OR EXISTS (
            SELECT 1 FROM nutritionist_patients np
            WHERE np.patient_id = appointments.patient_id
            AND np.nutritionist_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = appointments.patient_id
            AND up.nutritionist_id = auth.uid()
        )
    )
);

-- 4. DELETE policy
DROP POLICY IF EXISTS appointments_delete ON appointments;
CREATE POLICY appointments_delete ON appointments
FOR DELETE
TO authenticated
USING (
    nutritionist_id = auth.uid()
    AND (
        patient_id IS NULL
        OR EXISTS (
            SELECT 1 FROM nutritionist_patients np
            WHERE np.patient_id = appointments.patient_id
            AND np.nutritionist_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = appointments.patient_id
            AND up.nutritionist_id = auth.uid()
        )
    )
);
