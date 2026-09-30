DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM anamnesis_templates WHERE title = 'Anamnese Mulher' AND is_system_default = true) THEN
        INSERT INTO anamnesis_templates (nutritionist_id, title, description, sections, is_system_default, is_active)
        VALUES (NULL, 'Anamnese Mulher', 'Formulário padrão adaptado para mulheres.', '[]'::jsonb, true, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM anamnesis_templates WHERE title = 'Anamnese Homem' AND is_system_default = true) THEN
        INSERT INTO anamnesis_templates (nutritionist_id, title, description, sections, is_system_default, is_active)
        VALUES (NULL, 'Anamnese Homem', 'Formulário padrão adaptado para homens.', '[]'::jsonb, true, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM anamnesis_templates WHERE title = 'Anamnese Pediátrica' AND is_system_default = true) THEN
        INSERT INTO anamnesis_templates (nutritionist_id, title, description, sections, is_system_default, is_active)
        VALUES (NULL, 'Anamnese Pediátrica', 'Formulário padrão adaptado para crianças até 10 anos.', '[]'::jsonb, true, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM anamnesis_templates WHERE title = 'Anamnese Idoso' AND is_system_default = true) THEN
        INSERT INTO anamnesis_templates (nutritionist_id, title, description, sections, is_system_default, is_active)
        VALUES (NULL, 'Anamnese Idoso', 'Formulário padrão adaptado para idosos.', '[]'::jsonb, true, true);
    END IF;
END $$;
